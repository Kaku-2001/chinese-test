/**
 * 中国語 単語テスト（Googleスプレッドシート + Apps Script）
 *
 * 学生は受験コードで入り、「今週の回」のテストを1回だけ受けられる。
 * 出題は 単語（語リスト）・穴埋め・聴解（音声を聞いて選ぶ）・読解・スピーキング（録音して提出）の組み合わせ。
 * スピーキングの録音はGoogleドライブの「録音フォルダ」に保存し、評価は先生が「スピーキング提出」シートに書き込む。
 * 結果は「提出」「解答明細」などのシートに溜まり、学生は自分の結果だけを何度でも見られる。
 * 採点はすべてサーバー側で行い、正解は提出前の画面には送らない。
 */

var SHEET = {
  settings: '設定', students: '学生', words: '語リスト', subs: '提出', detail: '解答明細',
  rtext: '読解本文', rq: '読解設問', rsubs: '読解提出', rdetail: '読解明細',
  cloze: '穴埋め', csubs: '穴埋め提出', cdetail: '穴埋め明細',
  listen: '聴解', lsubs: '聴解提出', ldetail: '聴解明細',
  speak: 'スピーキング', sdetail: 'スピーキング提出'
};
var HEAD = {
  students: ['コード', '表示名', 'メモ（学生には表示されません）'],
  words: ['回', 'コード', '簡体字', '拼音', '意味'],
  subs: ['提出日時', '回', 'コード', '表示名', '正答数', '問題数', '正答率'],
  detail: ['提出日時', '回', 'コード', '表示名', '簡体字', '拼音', '意味', '形式', '学生の解答', '正誤'],
  rtext: ['回', 'コード', '本文番号', 'タイトル', '本文', '語注（1行に1つ）'],
  rq: ['本文番号', '設問', '選択肢A', '選択肢B', '選択肢C', '選択肢D', '正解（A〜D）'],
  rsubs: ['提出日時', '回', 'コード', '表示名', '正答数', '問題数', '正答率'],
  rdetail: ['提出日時', '回', 'コード', '表示名', '本文番号', '設問', '正解', '学生の解答', '正誤'],
  cloze: ['回', 'コード', '問題文', '選択肢A', '選択肢B', '選択肢C', '選択肢D', '正解（A〜D）', '解説（任意）'],
  csubs: ['提出日時', '回', 'コード', '表示名', '正答数', '問題数', '正答率'],
  cdetail: ['提出日時', '回', 'コード', '表示名', '問題文', '正解', '学生の解答', '正誤'],
  listen: ['回', 'コード', '音声ファイル名', '問題文（任意）', '選択肢A', '選択肢B', '選択肢C', '選択肢D', '正解（A〜D）', '解説（任意）'],
  lsubs: ['提出日時', '回', 'コード', '表示名', '正答数', '問題数', '正答率'],
  ldetail: ['提出日時', '回', 'コード', '表示名', '音声ファイル名', '問題文', '正解', '学生の解答', '正誤'],
  speak: ['回', 'コード', '課題（学生に見せる文）', '補足（任意）', 'お手本の音声ファイル名（任意）', '録音の長さ（秒・任意）'],
  sdetail: ['提出日時', '回', 'コード', '表示名', '課題', '録音', '評価（先生が入力）', 'コメント（先生が入力）']
};
var RESULT_SHEETS = ['subs', 'rsubs', 'csubs', 'lsubs']; // 回ごとの点数を記録するシート（単語・読解・穴埋め・聴解）
// 後から追加した設定。「初期設定」を押すと、今ある「設定」シートの下に足される
var EXTRA_SETTINGS = [
  ['穴埋めの見出し', '穴埋め', '「穴埋め」シートの問題の見出し。空欄のない4択（拼音の規則の問題など）に使うときは「拼音」などに変えられます'],
  ['聴解の見出し', '聴解', '「聴解」シートの問題の見出し'],
  ['音声フォルダ', '', '聴解の音声ファイルを入れるGoogleドライブのフォルダのURL。空なら「初期設定」で自動で作ります'],
  ['スピーキングの見出し', 'スピーキング', '「スピーキング」シートの課題の見出し'],
  ['録音フォルダ', '', 'スピーキングで学生が録音した音声を保存するGoogleドライブのフォルダのURL（回ごとのフォルダに分けて保存）。空なら自動で作ります']
];
var AUDIO_MAX = 3 * 1024 * 1024; // 1ファイル3MBまで
var SPEAK_SEC = 60, SPEAK_SEC_MAX = 180; // スピーキングの録音の長さ（秒）：書いていないときの長さと、上限
var REC_EXT = { 'audio/webm': 'webm', 'video/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'video/mp4': 'm4a', 'audio/x-m4a': 'm4a',
  'audio/aac': 'aac', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav' }; // 録音の種類 → 保存するときの拡張子
var UNRECORDED = '（録音なし）';
var AUDIO_MIME = { m4a: 'audio/mp4', mp4: 'audio/mp4', aac: 'audio/aac', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg',
  oga: 'audio/ogg', opus: 'audio/ogg', webm: 'audio/webm', flac: 'audio/flac', caf: 'audio/x-caf', '3gp': 'audio/3gpp', amr: 'audio/amr' };
var LETTERS = ['A', 'B', 'C', 'D'];
var TZ = 'Asia/Tokyo';
var ALL = '全員';
var EXAMPLE = '例'; // 回の欄が「例」の行は見本。出題しない
var MODES = ['混合', '中→日', '日→中']; // 旧形式の設定（「出題形式」行）との互換用

// 出題の種類：問題に出す欄 → 選ぶ欄（h=簡体字, p=拼音, m=意味）
var KINDS = ['hm', 'mh', 'hp', 'ph', 'mp', 'pm'];
var FIELD = { h: 'hanzi', p: 'pinyin', m: 'meaning' };
var KIND_LABEL = { hm: '中→日', mh: '日→中', hp: '中→拼音', ph: '拼音→中', mp: '日→拼音', pm: '拼音→日' };
var KIND_HELP = {
  hm: '簡体字を見て、意味を選ぶ',
  mh: '意味を見て、簡体字を選ぶ',
  hp: '簡体字を見て、拼音を選ぶ（誤答の選択肢は声調違い）',
  ph: '拼音を見て、簡体字を選ぶ',
  mp: '意味を見て、拼音を選ぶ（誤答の選択肢は声調違い）',
  pm: '拼音を見て、意味を選ぶ'
};
var LEGACY_KIND = { zh: 'hm', ja: 'mh' };
var TONE_MARKS = { a: 'āáǎà', e: 'ēéěè', i: 'īíǐì', o: 'ōóǒò', u: 'ūúǔù', 'ü': 'ǖǘǚǜ' };
var MARK_INFO = {};
Object.keys(TONE_MARKS).forEach(function (b) {
  for (var t = 0; t < 4; t++) MARK_INFO[TONE_MARKS[b].charAt(t)] = { base: b, tone: t };
});
var CODE_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789'; // 0/o, 1/l/i を除外
var CODE_LEN = 6;
var N_OPTIONS = 4;
var UNANSWERED = '（未回答）';

/* ===================== 先生用メニュー ===================== */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('単語テスト')
    .addItem('初期設定（シートを作成）', 'setupSheets')
    .addItem('学生コードを発行', 'issueCodes')
    .addToUi();
}

function setupSheets() {
  var ss = ss_();
  var created = [];

  if (!ss.getSheetByName(SHEET.settings)) {
    var st = ss.insertSheet(SHEET.settings);
    var rowsS = [
      ['項目', '値', '説明'],
      ['講座名', '中国語講座', 'テストページの見出しに表示されます'],
      ['今週の回', 1, '学生はこの回のテストを1回だけ受けられます。毎週ここを書き換えます'],
      ['受付', true, 'オフにするとテストを受けられません（結果の閲覧はできます）']
    ];
    KINDS.forEach(function (k) { rowsS.push(['出題：' + KIND_LABEL[k], true, KIND_HELP[k] + '。オンの形式で、できるだけ均等に出題します']); });
    rowsS.push(['拼音を表示', true, '中→日の問題で、簡体字に拼音を添えます']);
    rowsS.push(['プレビュー用コード', 'pv' + randomCode_(), 'このコードで入ると、好きな回を選んで受けられます（記録は残りません）。学生には教えないでください']);
    st.getRange(1, 1, rowsS.length, 3).setValues(rowsS);
    st.getRange(4, 2, rowsS.length - 4, 1).insertCheckboxes();
    styleHeader_(st, 3);
    st.setColumnWidth(1, 110);
    st.setColumnWidth(3, 440);
    created.push(SHEET.settings);
  }

  if (!ss.getSheetByName(SHEET.students)) {
    var ss2 = ss.insertSheet(SHEET.students);
    ss2.getRange(1, 1, 1, HEAD.students.length).setValues([HEAD.students]);
    ss2.getRange('A:A').setNumberFormat('@');
    styleHeader_(ss2, HEAD.students.length);
    ss2.setColumnWidth(3, 280);
    created.push(SHEET.students);
  }

  if (!ss.getSheetByName(SHEET.words)) {
    var w = ss.insertSheet(SHEET.words);
    var sample = [
      [1, ALL, '你好', 'nǐ hǎo', 'こんにちは'],
      [1, ALL, '谢谢', 'xièxie', 'ありがとう'],
      [1, ALL, '老师', 'lǎoshī', '先生'],
      [1, ALL, '朋友', 'péngyou', '友達'],
      [1, ALL, '喜欢', 'xǐhuan', '好きだ'],
      [1, ALL, '明天', 'míngtiān', '明日'],
      [1, ALL, '吃饭', 'chī fàn', 'ご飯を食べる'],
      [1, ALL, '学习', 'xuéxí', '勉強する']
    ];
    w.getRange(1, 1, 1, HEAD.words.length).setValues([HEAD.words]);
    w.getRange(2, 1, sample.length, HEAD.words.length).setValues(sample);
    w.getRange('B:B').setNumberFormat('@');
    styleHeader_(w, HEAD.words.length);
    w.setColumnWidth(5, 240);
    created.push(SHEET.words);
  }

  if (!ss.getSheetByName(SHEET.subs)) {
    var s = ss.insertSheet(SHEET.subs);
    s.getRange(1, 1, 1, HEAD.subs.length).setValues([HEAD.subs]);
    s.getRange('A:A').setNumberFormat('yyyy/MM/dd HH:mm');
    s.getRange('G:G').setNumberFormat('0%');
    styleHeader_(s, HEAD.subs.length);
    created.push(SHEET.subs);
  }

  if (!ss.getSheetByName(SHEET.detail)) {
    var d = ss.insertSheet(SHEET.detail);
    d.getRange(1, 1, 1, HEAD.detail.length).setValues([HEAD.detail]);
    d.getRange('A:A').setNumberFormat('yyyy/MM/dd HH:mm');
    styleHeader_(d, HEAD.detail.length);
    created.push(SHEET.detail);
  }

  if (!ss.getSheetByName(SHEET.rtext)) {
    var rt = ss.insertSheet(SHEET.rtext);
    rt.getRange(1, 1, 1, HEAD.rtext.length).setValues([HEAD.rtext]);
    rt.getRange('B:B').setNumberFormat('@');
    rt.getRange('E:F').setWrap(true);
    styleHeader_(rt, HEAD.rtext.length);
    rt.setColumnWidth(5, 420);
    rt.setColumnWidth(6, 260);
    created.push(SHEET.rtext);
  }
  if (!ss.getSheetByName(SHEET.rq)) {
    var rq = ss.insertSheet(SHEET.rq);
    rq.getRange(1, 1, 1, HEAD.rq.length).setValues([HEAD.rq]);
    rq.getRange('B:F').setWrap(true);
    styleHeader_(rq, HEAD.rq.length);
    rq.setColumnWidth(2, 280);
    created.push(SHEET.rq);
  }
  if (!ss.getSheetByName(SHEET.cloze)) {
    var cz = ss.insertSheet(SHEET.cloze);
    var ex = [ // 回が「例」の行は出題されない（入力の見本）
      [EXAMPLE, ALL, '他把作业写（　）了，现在可以出去玩儿。', '完', '过', '着', '起', 'A', '「写完」＝書き終える（結果補語）'],
      [EXAMPLE, ALL, '这件事（　）我来说非常重要。', '给', '跟', '对', '向', 'C', '「对…来说」＝…にとって'],
      [EXAMPLE, ALL, '我昨天买了一（　）新衣服。', '条', '件', '本', '张', 'B', '衣服の量詞は「件」']
    ];
    cz.getRange(1, 1, 1, HEAD.cloze.length).setValues([HEAD.cloze]);
    cz.getRange(2, 1, ex.length, HEAD.cloze.length).setValues(ex).setFontColor('#9AA5A1').setFontStyle('italic');
    cz.getRange('B:B').setNumberFormat('@');
    cz.getRange('C:I').setWrap(true);
    cz.getRange(2, 8, 999, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(LETTERS, true).build());
    styleHeader_(cz, HEAD.cloze.length);
    cz.getRange(1, 3).setNote('空欄は（　）で書きます（＿＿ や ( ) でも可）。\n選択肢は2〜4個。正解は記号（A〜D）で選びます。\n「コード」は「全員」または学生のコード。\n回が「例」の行は出題されません（入力の見本）。');
    cz.getRange(1, 9).setNote('任意。学生が結果画面で見られます。');
    cz.setColumnWidth(3, 320);
    cz.setColumnWidth(9, 280);
    created.push(SHEET.cloze);
  }
  if (!ss.getSheetByName(SHEET.listen)) {
    var ls = ss.insertSheet(SHEET.listen);
    var lex = [ // 回が「例」の行は出題されない（入力の見本）。拼音は数字で書くと声調記号に直して表示する
      [EXAMPLE, ALL, 'ma1', '声調を選んでください', 'ma1', 'ma2', 'ma3', 'ma4', 'A', '第1声：高く平らに'],
      [EXAMPLE, ALL, 'zhi1', '', 'zhi1', 'zi1', 'ji1', 'chi1', 'A', 'zh は舌先をそり上げる'],
      [EXAMPLE, ALL, 'nihao', '実際の発音はどれ？', 'ni2 hao3', 'ni3 hao3', 'ni2 hao2', 'ni3 hao2', 'A', '第3声が続くと、前の第3声は第2声で発音する']
    ];
    ls.getRange(1, 1, 1, HEAD.listen.length).setValues([HEAD.listen]);
    ls.getRange(2, 1, lex.length, HEAD.listen.length).setValues(lex).setFontColor('#9AA5A1').setFontStyle('italic');
    ls.getRange('B:C').setNumberFormat('@');
    ls.getRange('D:J').setWrap(true);
    ls.getRange(2, 9, 999, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(LETTERS, true).build());
    styleHeader_(ls, HEAD.listen.length);
    ls.getRange(1, 3).setNote('「設定」シートの「音声フォルダ」に入れたファイルの名前。\n拡張子（.m4a など）は省略できます。\nスマホのボイスメモ（m4a）や mp3 が使えます（1ファイル3MBまで）。');
    ls.getRange(1, 5).setNote('拼音は ma1 のように数字でも書けます（画面では mā と表示）。\n選択肢は2〜4個。正解は記号（A〜D）で選びます。\n回が「例」の行は出題されません（入力の見本）。');
    ls.setColumnWidth(4, 220);
    ls.setColumnWidth(10, 260);
    created.push(SHEET.listen);
  }
  if (!ss.getSheetByName(SHEET.speak)) {
    var sp = ss.insertSheet(SHEET.speak);
    var sex = [ // 回が「例」の行は出題されない（入力の見本）
      [EXAMPLE, ALL, '请大声朗读：我叫田中，我是大学生。', 'Wǒ jiào Tiánzhōng, wǒ shì dàxuéshēng.', '', 30],
      [EXAMPLE, ALL, '你周末一般做什么？请用中文回答。', '週末ふだん何をしますか。2〜3文で答えましょう', '', 60]
    ];
    sp.getRange(1, 1, 1, HEAD.speak.length).setValues([HEAD.speak]);
    sp.getRange(2, 1, sex.length, HEAD.speak.length).setValues(sex).setFontColor('#9AA5A1').setFontStyle('italic');
    sp.getRange('B:B').setNumberFormat('@');
    sp.getRange('C:D').setWrap(true);
    styleHeader_(sp, HEAD.speak.length);
    sp.getRange(1, 3).setNote('学生は、この文を見て声に出して答え、録音して提出します。\n拼音は ni3hao3 のように数字でも書けます（画面では nǐhǎo と表示）。\n回が「例」の行は出題されません（入力の見本）。');
    sp.getRange(1, 5).setNote('任意。「音声フォルダ」に入れたお手本の音声ファイルの名前。テスト中に学生が聞けます。');
    sp.getRange(1, 6).setNote('任意。1つの課題で録音できる長さ（秒）。空なら60秒、最長180秒。');
    sp.setColumnWidth(3, 320);
    sp.setColumnWidth(4, 260);
    created.push(SHEET.speak);
  }
  if (!ss.getSheetByName(SHEET.sdetail)) {
    var sd = ensureSheet_(SHEET.sdetail, HEAD.sdetail);
    sd.getRange(1, 7).setNote('先生が入力します（例：8/10、A、よくできました）。書いた内容が学生の結果画面に出ます。');
    sd.getRange(1, 8).setNote('先生が入力します。学生の結果画面に出ます。');
    created.push(SHEET.sdetail);
  }
  [[SHEET.rsubs, HEAD.rsubs], [SHEET.rdetail, HEAD.rdetail], [SHEET.csubs, HEAD.csubs], [SHEET.cdetail, HEAD.cdetail],
   [SHEET.lsubs, HEAD.lsubs], [SHEET.ldetail, HEAD.ldetail]].forEach(function (x) {
    if (!ss.getSheetByName(x[0])) { ensureSheet_(x[0], x[1]); created.push(x[0]); }
  });
  var addedRows = ensureSettingRows_();
  var folderMsg = '';
  try {
    var url = ensureAudioFolder_();
    if (url) folderMsg = '\n聴解の音声フォルダをGoogleドライブに作りました（URLは「設定」シートの「音声フォルダ」）。';
  } catch (e) {
    folderMsg = '\n音声フォルダを作れませんでした。Googleドライブにフォルダを作り、そのURLを「設定」シートの「音声フォルダ」に貼ってください。';
  }
  try {
    if (ensureRecFolder_()) folderMsg += '\nスピーキングの録音フォルダをGoogleドライブに作りました（URLは「設定」シートの「録音フォルダ」）。';
  } catch (e) {
    folderMsg += '\n録音フォルダを作れませんでした。Googleドライブにフォルダを作り、そのURLを「設定」シートの「録音フォルダ」に貼ってください。';
  }

  if (addedRows.length) created.push('「設定」に ' + addedRows.join('・') + ' の行');
  alert_((created.length
    ? '作成したもの：' + created.join('、') +
      (created.indexOf(SHEET.words) >= 0 ? '\n「語リスト」の8語は動作確認用の例です。実際の語に置き換えてください。' : '') +
      (created.indexOf(SHEET.cloze) >= 0 || created.indexOf(SHEET.listen) >= 0 || created.indexOf(SHEET.speak) >= 0 ? '\n灰色の行は入力の見本です（回が「例」なので出題されません）。' : '')
    : 'すべてのシートはすでにあります。') + folderMsg);
}

/** 「設定」シートに、後から追加した行（EXTRA_SETTINGS）がなければ足す。足した項目名を返す */
function ensureSettingRows_() {
  var sh = sheet_(SHEET.settings);
  if (!sh) return [];
  var have = {};
  sh.getDataRange().getValues().forEach(function (r) { have[norm_(r[0])] = true; });
  var add = EXTRA_SETTINGS.filter(function (r) { return !have[r[0]]; });
  if (add.length) sh.getRange(sh.getLastRow() + 1, 1, add.length, 3).setValues(add);
  return add.map(function (r) { return r[0]; });
}

/** 「音声フォルダ」が空なら、ドライブにフォルダを作ってURLを書き込む。作ったときはURLを返す */
function ensureAudioFolder_() { return ensureFolderSetting_('音声フォルダ', '中国語テスト 音声'); }
/** 「録音フォルダ」が空なら、同じようにフォルダを作る */
function ensureRecFolder_() { return ensureFolderSetting_('録音フォルダ', '中国語テスト 録音'); }
function ensureFolderSetting_(item, title) {
  var sh = sheet_(SHEET.settings);
  if (!sh) return '';
  var vals = sh.getDataRange().getValues();
  for (var i = 0; i < vals.length; i++) {
    if (norm_(vals[i][0]) !== item) continue;
    if (norm_(vals[i][1])) return '';
    var url = DriveApp.createFolder(title + '（' + readSettings_().course + '）').getUrl();
    sh.getRange(i + 1, 2).setValue(url);
    return url;
  }
  return '';
}

function issueCodes() {
  var sh = sheet_(SHEET.students);
  if (!sh) { alert_('先にメニューの「初期設定」を実行してください。'); return; }
  var last = sh.getLastRow();
  if (last < 2) { alert_('「学生」シートの「表示名」に学生を入力してから実行してください。'); return; }
  var vals = sh.getRange(2, 1, last - 1, 2).getValues();
  var used = {};
  vals.forEach(function (r) { var c = normCode_(r[0]); if (c) used[c] = true; });
  var n = 0;
  vals.forEach(function (r) {
    if (!normCode_(r[0]) && norm_(r[1])) {
      var c;
      do { c = randomCode_(); } while (used[c]);
      used[c] = true;
      r[0] = c;
      n++;
    }
  });
  sh.getRange(2, 1, last - 1, 1).setValues(vals.map(function (r) { return [r[0]]; }));
  alert_(n
    ? n + '人分のコードを発行しました。各学生に個別に伝えてください。'
    : '新しく発行するコードはありません（表示名が入っていて、コードが空の行が対象です）。');
}

/* ===================== ウェブページ ===================== */

function doGet() {
  var t = HtmlService.createTemplateFromFile('Index');
  t.course = readSettings_().course;
  return t.evaluate()
    .setTitle(t.course + ' 単語テスト')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * アプリ（別の場所に置いた学生用ページ）からの呼び出し口。
 * 本文は {"fn": "api_status", "args": [...]} の JSON。結果を JSON で返す。
 * 以前のページ（doGet）もそのまま使える。
 */
var API = { api_status: api_status, api_start: api_start, api_submit: api_submit, api_result: api_result };
function doPost(e) {
  var out;
  try {
    var req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var fn = Object.prototype.hasOwnProperty.call(API, req.fn) ? API[req.fn] : null;
    out = fn ? fn.apply(null, Array.isArray(req.args) ? req.args.slice(0, 8) : [])
             : fail_('不明な呼び出しです。');
  } catch (err) {
    console.error(err);
    out = fail_('サーバーでエラーが起きました。少し待ってから、もう一度お試しください。');
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

/** ホーム画面：今週の状態と、本人の過去の結果一覧（単語と読解をまとめて回ごとに表示） */
function api_status(code) {
  var s = readSettings_();
  if (isPreview_(code, s)) return previewStatus_(s);
  var st = findStudent_(code);
  if (!st) return fail_('コードが見つかりません。もう一度確認してください。');
  var byRound = {};
  var add = function (r, speak) {
    if (normCode_(r[2]) !== st.code) return;
    var rd = normRound_(r[1]), t = r[0] instanceof Date ? r[0].getTime() : 0;
    var h = byRound[rd] || (byRound[rd] = { round: rd, date: fmtDate_(r[0]), t: t, correct: 0, total: 0, speak: 0 });
    if (speak) h.speak++;
    else { h.correct += Number(r[4]) || 0; h.total += Number(r[5]) || 0; }
    if (t > h.t) { h.t = t; h.date = fmtDate_(r[0]); }
  };
  RESULT_SHEETS.forEach(function (k) { rows_(SHEET[k], HEAD.subs.length).forEach(function (r) { add(r, false); }); });
  rows_(SHEET.sdetail, HEAD.sdetail.length).forEach(function (r) { add(r, true); }); // スピーキングは点数に入れず、課題の数だけ数える
  var history = Object.keys(byRound).map(function (k) { return byRound[k]; })
    .sort(function (a, b) { return b.t - a.t; })
    .map(function (h) { return { round: h.round, date: h.date, correct: h.correct, total: h.total, speak: h.speak }; });
  var nWords = s.round ? wordsFor_(st.code, s.round).length : 0;
  var nReading = 0;
  if (s.round) readingFor_(st.code, s.round).forEach(function (p) { nReading += p.questions.length; });
  var nCloze = s.round ? clozeFor_(st.code, s.round).length : 0;
  var nListen = s.round ? listenFor_(st.code, s.round).length : 0;
  var nSpeak = s.round ? speakFor_(st.code, s.round).length : 0;
  return {
    ok: true, course: s.course, name: st.name, round: s.round, open: s.open,
    submitted: history.some(function (h) { return h.round === s.round; }),
    count: nWords + nCloze + nListen + nReading + nSpeak, countWords: nWords, countCloze: nCloze, countListen: nListen, countReading: nReading,
    countSpeak: nSpeak,
    labels: s.labels, history: history
  };
}

/** テスト開始：問題と選択肢だけを返す（正解は返さない）。プレビューでは opts.round と opts.as を使う */
function api_start(code, opts) {
  var s = readSettings_();
  var pv = isPreview_(code, s), st = null, round, as;
  if (pv) {
    round = normRound_(opts && opts.round);
    as = previewAs_(opts);
    if (!round) return fail_('回を選んでください。');
  } else {
    st = findStudent_(code);
    if (!st) return fail_('コードが見つかりません。');
    if (!s.open || !s.round) return fail_('現在、テストの受付はしていません。');
    if (hasSubmitted_(st.code, s.round)) return fail_('第' + s.round + '回はすでに提出済みです。結果はホーム画面から確認できます。');
    round = s.round; as = st.code;
  }
  var pool = allWords_();
  var list = wordsFor_(as, round, pool);
  var reading = readingFor_(as, round);
  var cloze = clozeFor_(as, round);
  var listen = listenFor_(as, round);
  var speak = speakFor_(as, round);
  if (!list.length && !reading.length && !cloze.length && !listen.length && !speak.length) return fail_('第' + round + '回の問題はまだ設定されていません。');
  var sr = Object.assign({}, s, { round: round });
  var audio = loadAudio_(s.audioFolder, listen.map(function (q) { return q.file; }).concat(speak.map(function (q) { return q.model; })));
  return {
    ok: true, round: round, preview: pv, labels: s.labels,
    questions: list.length ? buildQuestions_(list, pool, sr) : [],
    cloze: cloze.map(function (q) { return { text: q.text, options: q.options }; }),
    listen: listen.map(function (q) { return audioOut_({ text: q.text, options: q.options }, audio[q.file], pv); }),
    reading: reading.map(function (p) {
      return { pid: p.pid, title: p.title, text: p.text, notes: p.notes,
        questions: p.questions.map(function (q) { return { text: q.text, options: q.options }; }) };
    }),
    speak: speak.map(function (q) {
      var o = { text: q.text, hint: q.hint, sec: q.sec };
      return q.model ? audioOut_(o, audio[q.model], pv) : o;
    })
  };
}

/**
 * 提出：サーバー側で採点し、記録する。同じ回の2回目以降は受け付けない。プレビューは採点だけして記録しない。
 * スピーキングの録音（speakAnswers: [{i: 課題の番号, mime, data: base64}]）はドライブに保存し、評価は先生が後で書き込む
 */
function api_submit(code, round, answers, readingAnswers, opts, clozeAnswers, listenAnswers, speakAnswers) {
  var s0 = readSettings_();
  if (isPreview_(code, s0)) {
    var r = normRound_(round), as = previewAs_(opts);
    var g = grade_(wordsFor_(as, r), readingFor_(as, r), answers, readingAnswers, clozeFor_(as, r), clozeAnswers, listenFor_(as, r), listenAnswers);
    var precs = recordingsFor_(speakFor_(as, r), speakAnswers);
    if (typeof precs === 'string') return fail_(precs);
    var res = { round: r, date: fmtDate_(new Date()), correct: g.correct, total: g.total, items: g.items, reading: g.reading,
      cloze: g.cloze, listen: listenOut_(g.listen), speak: speakOut_(speakFor_(as, r), precs), labels: s0.labels, preview: true };
    return { ok: true, result: res };
  }
  var lock = LockService.getScriptLock();
  try { lock.waitLock(15000); }
  catch (e) { return fail_('混み合っています。少し待ってから、もう一度「提出する」を押してください。'); }
  try {
    var st = findStudent_(code);
    if (!st) return fail_('コードが見つかりません。');
    var s = readSettings_();
    if (!s.open) return fail_('受付が終了したため、提出できませんでした。');
    if (normRound_(round) !== s.round) return fail_('テストの回が切り替わったため、提出できませんでした。ホームに戻ってください。');
    if (hasSubmitted_(st.code, s.round)) return fail_('第' + s.round + '回はすでに提出済みです。');

    var now = new Date();
    var list = wordsFor_(st.code, s.round), reading = readingFor_(st.code, s.round), cloze = clozeFor_(st.code, s.round);
    var listen = listenFor_(st.code, s.round), speak = speakFor_(st.code, s.round);
    var recs = recordingsFor_(speak, speakAnswers);
    if (typeof recs === 'string') return fail_(recs);
    var urls; // 録音を先に保存する。保存できなければ何も記録せず、もう一度提出してもらう
    try { urls = saveRecordings_(s, st, recs); }
    catch (e) { console.error(e); return fail_('録音を保存できませんでした。少し待ってから、もう一度「提出する」を押してください。'); }
    var g2 = grade_(list, reading, answers, readingAnswers, cloze, clozeAnswers, listen, listenAnswers);
    var head = [now, s.round, st.code, st.name];
    if (list.length) {
      writeRows_(SHEET.subs, HEAD.subs, [head.concat([g2.vCorrect, list.length, g2.vCorrect / list.length])]);
      writeRows_(SHEET.detail, HEAD.detail, g2.items.map(function (d) {
        return head.concat([d.hanzi, d.pinyin, d.meaning, KIND_LABEL[d.type], d.choice ? safeCell_(d.choice) : UNANSWERED, d.ok ? '○' : '×']);
      }));
    }
    if (reading.length) {
      writeRows_(SHEET.rsubs, HEAD.rsubs, [head.concat([g2.rCorrect, g2.rTotal, g2.rTotal ? g2.rCorrect / g2.rTotal : 0])]);
      var rows = [];
      g2.reading.forEach(function (p) {
        p.questions.forEach(function (q) {
          rows.push(head.concat([p.pid, q.text, q.answer, q.choice ? safeCell_(q.choice) : UNANSWERED, q.ok ? '○' : '×']));
        });
      });
      writeRows_(SHEET.rdetail, HEAD.rdetail, rows);
    }
    if (cloze.length) {
      writeRows_(SHEET.csubs, HEAD.csubs, [head.concat([g2.cCorrect, cloze.length, g2.cCorrect / cloze.length])]);
      writeRows_(SHEET.cdetail, HEAD.cdetail, g2.cloze.map(function (q) {
        return head.concat([safeCell_(q.text), safeCell_(q.answer), q.choice ? safeCell_(q.choice) : UNANSWERED, q.ok ? '○' : '×']);
      }));
    }
    if (listen.length) {
      writeRows_(SHEET.lsubs, HEAD.lsubs, [head.concat([g2.lCorrect, listen.length, g2.lCorrect / listen.length])]);
      writeRows_(SHEET.ldetail, HEAD.ldetail, g2.listen.map(function (q) {
        return head.concat([safeCell_(q.file), safeCell_(q.text), safeCell_(q.answer), q.choice ? safeCell_(q.choice) : UNANSWERED, q.ok ? '○' : '×']);
      }));
    }
    if (speak.length) {
      writeRows_(SHEET.sdetail, HEAD.sdetail, speak.map(function (q, i) {
        return head.concat([safeCell_(q.text), urls[i] || UNRECORDED, '', '']);
      }));
    }
    SpreadsheetApp.flush();
    return { ok: true, result: { round: s.round, date: fmtDate_(now), correct: g2.correct, total: g2.total, items: g2.items, reading: g2.reading,
      cloze: g2.cloze, listen: listenOut_(g2.listen), speak: speakOut_(speak, recs), labels: s.labels } };
  } finally {
    lock.releaseLock();
  }
}

/** 単語・読解・穴埋めを採点する（記録はしない） */
function grade_(list, reading, answers, readingAnswers, cloze, clozeAnswers, listen, listenAnswers) {
  var ans = Array.isArray(answers) ? answers.slice(0, 500) : [];
  var vCorrect = 0;
  var items = list.map(function (w) {
    var a = null, kind = 'hm';
    for (var i = 0; i < ans.length; i++) {
      var x = ans[i];
      if (!x) continue;
      var k = LEGACY_KIND[x.type] || x.type;
      if (KINDS.indexOf(k) < 0) continue;
      var pf = FIELD[k.charAt(0)];
      if (w[pf] && key_(pf, x.prompt) === key_(pf, w[pf])) { a = x; kind = k; break; }
    }
    var af = FIELD[kind.charAt(1)];
    var choice = a ? norm_(a.choice).slice(0, 200) : '';
    var ok = !!choice && key_(af, choice) === key_(af, w[af]);
    if (ok) vCorrect++;
    return { hanzi: w.hanzi, pinyin: w.pinyin, meaning: w.meaning, type: kind, choice: choice, ok: ok };
  });
  var rans = Array.isArray(readingAnswers) ? readingAnswers.slice(0, 500) : [];
  var rCorrect = 0, rTotal = 0;
  var rres = reading.map(function (p) {
    return { pid: p.pid, title: p.title, text: p.text, notes: p.notes, questions: p.questions.map(function (q, qi) {
      var a = null;
      for (var i = 0; i < rans.length; i++) {
        var x = rans[i];
        if (x && norm_(x.pid) === p.pid && Number(x.qi) === qi) { a = x; break; }
      }
      var choice = a ? norm_(a.choice).slice(0, 500) : '';
      var answer = q.options[q.answer];
      var ok = !!choice && choice === answer;
      rTotal++; if (ok) rCorrect++;
      return { text: q.text, answer: answer, choice: choice, ok: ok };
    }) };
  });
  var cans = Array.isArray(clozeAnswers) ? clozeAnswers.slice(0, 500) : [];
  var cCorrect = 0;
  var cres = (cloze || []).map(function (q) {
    var a = null;
    for (var i = 0; i < cans.length; i++) {
      var x = cans[i];
      if (x && norm_(x.text) === q.text) { a = x; break; }
    }
    var choice = a ? norm_(a.choice).slice(0, 500) : '';
    var answer = q.options[q.answer];
    var ok = !!choice && choice === answer;
    if (ok) cCorrect++;
    return { text: q.text, answer: answer, choice: choice, ok: ok, note: q.note };
  });
  // 聴解は問題文が空や同じこともあるので、出題順の番号（i）で答えを対応させる
  var lans = Array.isArray(listenAnswers) ? listenAnswers.slice(0, 500) : [];
  var lCorrect = 0;
  var lres = (listen || []).map(function (q, i) {
    var a = null;
    for (var k = 0; k < lans.length; k++) {
      var x = lans[k];
      if (x && typeof x === 'object' && Number(x.i) === i) { a = x; break; }
    }
    var choice = a ? norm_(a.choice).normalize('NFC').slice(0, 500) : '';
    var answer = q.options[q.answer];
    var ok = !!choice && choice === answer;
    if (ok) lCorrect++;
    return { file: q.file, text: q.text, answer: answer, choice: choice, ok: ok, note: q.note };
  });
  return { items: items, reading: rres, cloze: cres, listen: lres, vCorrect: vCorrect, rCorrect: rCorrect, rTotal: rTotal, cCorrect: cCorrect, lCorrect: lCorrect,
    correct: vCorrect + rCorrect + cCorrect + lCorrect, total: list.length + rTotal + cres.length + lres.length };
}

/** プレビュー用のホーム情報：問題が登録されている回と、学生の一覧 */
function previewStatus_(s) {
  var rounds = {};
  allWords_().forEach(function (w) { if (w.round) rounds[w.round] = true; });
  rows_(SHEET.rtext, HEAD.rtext.length).forEach(function (r) { var rd = normRound_(r[0]); if (rd && norm_(r[2])) rounds[rd] = true; });
  rows_(SHEET.cloze, HEAD.cloze.length).forEach(function (r) { var rd = normRound_(r[0]); if (rd && norm_(r[2])) rounds[rd] = true; });
  rows_(SHEET.listen, HEAD.listen.length).forEach(function (r) { var rd = normRound_(r[0]); if (rd && norm_(r[2])) rounds[rd] = true; });
  rows_(SHEET.speak, HEAD.speak.length).forEach(function (r) { var rd = normRound_(r[0]); if (rd && norm_(r[2])) rounds[rd] = true; });
  var list = Object.keys(rounds).sort(function (a, b) { return (Number(a) - Number(b)) || a.localeCompare(b); });
  var students = rows_(SHEET.students, HEAD.students.length)
    .filter(function (r) { return normCode_(r[0]); })
    .map(function (r) { return { code: normCode_(r[0]), name: norm_(r[1]) }; });
  return { ok: true, preview: true, course: s.course, round: s.round, rounds: list, students: students };
}
function isPreview_(code, s) { var c = normCode_(code); return !!c && !!s.preview && c === s.preview; }
function previewAs_(opts) { return normCode_(opts && opts.as) || '\u0000'; } // 空なら「全員」の問題だけ

/** 本人の、指定した回の結果だけを返す */
function api_result(code, round) {
  var st = findStudent_(code);
  if (!st) return fail_('コードが見つかりません。');
  var r = normRound_(round);
  var mine = function (x) { return normCode_(x[2]) === st.code && normRound_(x[1]) === r; };
  var subs = [];
  RESULT_SHEETS.forEach(function (k) { subs = subs.concat(rows_(SHEET[k], HEAD.subs.length).filter(mine)); });
  var srows = rows_(SHEET.sdetail, HEAD.sdetail.length).filter(mine);
  if (!subs.length && !srows.length) return fail_('この回の結果は見つかりません。');
  var correct = 0, total = 0, last = (subs[0] || srows[0])[0];
  subs.forEach(function (x) { correct += Number(x[4]) || 0; total += Number(x[5]) || 0; });
  subs.concat(srows).forEach(function (x) {
    if (x[0] instanceof Date && (!(last instanceof Date) || x[0] > last)) last = x[0];
  });
  var items = rows_(SHEET.detail, HEAD.detail.length).filter(mine).map(function (x) {
    var c = norm_(x[8]);
    return {
      hanzi: norm_(x[4]), pinyin: norm_(x[5]), meaning: norm_(x[6]),
      type: kindFromLabel_(norm_(x[7])),
      choice: c === UNANSWERED ? '' : c, ok: norm_(x[9]) === '○'
    };
  });
  // 読解：本文番号ごとにまとめ、本文は「読解本文」シートの現在の内容を添える
  var texts = {};
  rows_(SHEET.rtext, HEAD.rtext.length).forEach(function (x) {
    var pid = norm_(x[2]);
    if (pid && !texts[pid]) texts[pid] = { title: pinyinText_(x[3]), text: pinyinText_(x[4]), notes: splitNotes_(x[5]) };
  });
  var reading = [], byPid = {};
  rows_(SHEET.rdetail, HEAD.rdetail.length).filter(mine).forEach(function (x) {
    var pid = norm_(x[4]);
    if (!byPid[pid]) {
      var t = texts[pid] || { title: '', text: '', notes: [] };
      byPid[pid] = { pid: pid, title: t.title, text: t.text, notes: t.notes, questions: [] };
      reading.push(byPid[pid]);
    }
    var c = norm_(x[7]);
    byPid[pid].questions.push({ text: norm_(x[5]), answer: norm_(x[6]), choice: c === UNANSWERED ? '' : c, ok: norm_(x[8]) === '○' });
  });
  // 穴埋め：解説は「穴埋め」シートの現在の内容を添える（拼音を直す前に記録した行でも見つかるよう、変換してから照らし合わせる）
  var notes = {};
  rows_(SHEET.cloze, HEAD.cloze.length).forEach(function (x) { var t = pinyinText_(x[2]); if (t && !(t in notes)) notes[t] = pinyinText_(x[8]); });
  var cloze = rows_(SHEET.cdetail, HEAD.cdetail.length).filter(mine).map(function (x) {
    var t = unCell_(x[4]), c = norm_(x[6]);
    return { text: t, answer: unCell_(x[5]), choice: c === UNANSWERED ? '' : unCell_(c), ok: norm_(x[7]) === '○', note: notes[pinyinText_(t)] || '' };
  });
  // 聴解：解説は「聴解」シートの現在の内容、音声はフォルダから読み直して添える
  var lnotes = {};
  rows_(SHEET.listen, HEAD.listen.length).forEach(function (x) {
    var k = norm_(x[2]) + '\n' + norm_(x[3]);
    if (norm_(x[2]) && !(k in lnotes)) lnotes[k] = norm_(x[9]);
  });
  var lrows = rows_(SHEET.ldetail, HEAD.ldetail.length).filter(mine);
  var s = readSettings_();
  var laudio = loadAudio_(s.audioFolder, lrows.map(function (x) { return unCell_(x[4]); }));
  var listen = lrows.map(function (x) {
    var f = unCell_(x[4]), t = unCell_(x[5]), c = norm_(x[7]);
    return audioOut_({ text: t, answer: unCell_(x[6]), choice: c === UNANSWERED ? '' : unCell_(c), ok: norm_(x[8]) === '○',
      note: lnotes[f + '\n' + t] || '' }, laudio[f], false);
  });
  // スピーキング：先生が書いた評価・コメントと、本人の録音を添える
  var speak = srows.map(function (x) {
    var o = { text: unCell_(x[4]), recorded: norm_(x[5]) !== UNRECORDED && !!norm_(x[5]), grade: norm_(x[6]), comment: norm_(x[7]) };
    var a = o.recorded ? recordingData_(norm_(x[5])) : null;
    o.audio = a && a.data ? { mime: a.mime, data: a.data } : null;
    return o;
  });
  return { ok: true, result: { round: r, date: fmtDate_(last), correct: correct, total: total, items: items, reading: reading,
    cloze: cloze, listen: listen, speak: speak, labels: s.labels } };
}

/* ===================== 内部処理 ===================== */

function buildQuestions_(list, pool, s) {
  var dupMeaning = countKeys_(list, 'meaning'), dupPinyin = countKeys_(list, 'pinyin');
  var sameRound = pool.filter(function (p) { return p.round === s.round; });

  // 1) 語ごとに使える形式を決める（同じ意味・同じ拼音の語が同じ回にあると、正解が一つに決まらない形式は使えない）
  var items = list.map(function (w) {
    var allowed = s.kinds.filter(function (k) {
      var pf = FIELD[k.charAt(0)], af = FIELD[k.charAt(1)];
      if (!w[pf] || !w[af]) return false;
      if (pf === 'meaning' && dupMeaning[key_('meaning', w.meaning)] > 1) return false;
      if (pf === 'pinyin' && dupPinyin[key_('pinyin', w.pinyin)] > 1) return false;
      return true;
    });
    return { w: w, allowed: allowed };
  });

  // 2) 形式ごとの出題数をできるだけ均等にする（18問・6形式なら各3問）
  var n = list.length, kinds = shuffle_(s.kinds.slice()), left = {};
  var base = Math.floor(n / kinds.length), extra = n % kinds.length;
  kinds.forEach(function (k, i) { left[k] = base + (i < extra ? 1 : 0); });
  shuffle_(items).sort(function (a, b) { return a.allowed.length - b.allowed.length; }); // 選択肢の少ない語から割り当てる
  items.forEach(function (it) {
    if (!it.allowed.length) { it.kind = 'hm'; return; }
    var best = -Infinity, cands = [];
    it.allowed.forEach(function (k) {
      var v = left[k] || 0;
      if (v > best) { best = v; cands = [k]; } else if (v === best) cands.push(k);
    });
    it.kind = cands[Math.floor(Math.random() * cands.length)];
    left[it.kind] = (left[it.kind] || 0) - 1;
  });

  // 3) 選択肢をつくる
  return shuffle_(items).map(function (it) {
    var w = it.w, kind = it.kind;
    var pf = FIELD[kind.charAt(0)], af = FIELD[kind.charAt(1)];
    var opts = [w[af]], used = {};
    used[key_(af, w[af])] = true;
    if (af === 'pinyin') {
      toneVariants_(w.pinyin, N_OPTIONS - 1).forEach(function (v) {
        if (opts.length < N_OPTIONS && !used[key_('pinyin', v)]) { used[key_('pinyin', v)] = true; opts.push(v); }
      });
    }
    [list, sameRound, pool].forEach(function (tier) {
      shuffle_(tier.slice()).forEach(function (d) {
        if (opts.length >= N_OPTIONS || d.hanzi === w.hanzi || !d[af]) return;
        if (d[pf] && key_(pf, d[pf]) === key_(pf, w[pf])) return; // その語も正解になってしまう
        var kk = key_(af, d[af]);
        if (used[kk]) return;
        used[kk] = true;
        opts.push(d[af]);
      });
    });
    return {
      type: kind,
      prompt: w[pf],
      pinyin: kind === 'hm' && s.pinyin ? w.pinyin : '',
      options: shuffle_(opts)
    };
  });
}

/** 声調だけを変えた拼音を最大 n 個つくる（例：lǎoshī → láoshī, lǎoshì） */
function toneVariants_(py, n) {
  var chars = Array.from(String(py).normalize('NFC'));
  var marks = [];
  chars.forEach(function (c, i) { if (MARK_INFO[c]) marks.push(i); });
  if (!marks.length) return [];
  var orig = chars.join(''), out = [], tries = 0;
  while (out.length < n && tries < 80) {
    tries++;
    var cs = chars.slice();
    var k = marks.length > 1 && Math.random() < 0.5 ? 2 : 1;
    shuffle_(marks.slice()).slice(0, k).forEach(function (i) {
      var info = MARK_INFO[cs[i]], t;
      do { t = Math.floor(Math.random() * 4); } while (t === info.tone);
      cs[i] = TONE_MARKS[info.base].charAt(t);
    });
    var v = cs.join('');
    if (v !== orig && out.indexOf(v) < 0) out.push(v);
  }
  return out;
}

/** 数字つき拼音（lao3shi1, lv4）を声調記号つき（lǎoshī, lǜ）に直す。5は軽声 */
function numToMark_(s) {
  if (!/[a-zA-Z:][1-5]/.test(s)) return s;
  return s.replace(/([a-zA-Zü:]+)([1-5])/g, function (m, syl, tone) {
    syl = syl.replace(/u:|v/g, 'ü').replace(/U:|V/g, 'Ü');
    var t = Number(tone);
    if (t === 5) return syl;
    var lower = syl.toLowerCase(), idx = -1;
    if (lower.indexOf('a') >= 0) idx = lower.indexOf('a');
    else if (lower.indexOf('e') >= 0) idx = lower.indexOf('e');
    else if (lower.indexOf('ou') >= 0) idx = lower.indexOf('o');
    else for (var i = lower.length - 1; i >= 0; i--) { if ('iouü'.indexOf(lower.charAt(i)) >= 0) { idx = i; break; } }
    if (idx < 0) return syl;
    var marked = TONE_MARKS[lower.charAt(idx)].charAt(t - 1);
    if (syl.charAt(idx) !== lower.charAt(idx)) marked = marked.toUpperCase();
    return syl.slice(0, idx) + marked + syl.slice(idx + 1);
  });
}

/** 読解・穴埋めの文の中にある数字つき拼音（qu4pi2, xie4xie）だけを声調記号つきに直す。A4・mp3・iPhone15 などはそのまま */
function pinyinText_(v) {
  return norm_(v).replace(/(?:[uU]:|[A-Za-zÜü])+[1-5](?:(?:[uU]:|[A-Za-zÜü])+[1-5]?)*/g, function (m, i, all) {
    if (/[A-Za-z0-9]/.test(all.charAt(i - 1)) || /[A-Za-z0-9]/.test(all.charAt(i + m.length))) return m;
    var syls = m.match(/(?:[uU]:|[A-Za-zÜü])+[1-5]?/g);
    if (syls.length === 1 && m === m.toUpperCase()) return m; // A4・B2 など
    if (!syls.every(function (s) { return /[aeiouvüAEIOUVÜ]/.test(s); })) return m;
    return numToMark_(m);
  }).normalize('NFC');
}

/** 比較用のキー。拼音は大文字小文字・空白・隔音符号の違いを無視する */
function key_(field, v) {
  var s = norm_(v).normalize('NFC');
  return field === 'pinyin' ? s.toLowerCase().replace(/[\s'’]/g, '') : s;
}
function countKeys_(list, field) {
  var c = {};
  list.forEach(function (w) { if (w[field]) { var k = key_(field, w[field]); c[k] = (c[k] || 0) + 1; } });
  return c;
}
function kindFromLabel_(label) {
  for (var i = 0; i < KINDS.length; i++) if (KIND_LABEL[KINDS[i]] === label) return KINDS[i];
  return 'hm';
}

function readSettings_() {
  var sh = sheet_(SHEET.settings);
  var map = {};
  if (sh) sh.getDataRange().getValues().forEach(function (r) { map[norm_(r[0])] = r[1]; });
  var kinds = KINDS.filter(function (k) { return isOn_(map['出題：' + KIND_LABEL[k]]); });
  var hasKindRows = KINDS.some(function (k) { return ('出題：' + KIND_LABEL[k]) in map; });
  if (!hasKindRows) { // 旧形式の「出題形式」行
    var mode = norm_(map['出題形式']);
    kinds = mode === '中→日' ? ['hm'] : mode === '日→中' ? ['mh'] : ['hm', 'mh'];
  }
  if (!kinds.length) kinds = ['hm'];
  return {
    course: norm_(map['講座名']) || '中国語講座',
    round: normRound_(map['今週の回']),
    open: isOn_(map['受付']),
    kinds: kinds,
    pinyin: !(map['拼音を表示'] === false || norm_(map['拼音を表示']).toUpperCase() === 'FALSE'),
    preview: normCode_(map['プレビュー用コード']),
    audioFolder: norm_(map['音声フォルダ']),
    recFolder: norm_(map['録音フォルダ']),
    labels: { cloze: norm_(map['穴埋めの見出し']) || '穴埋め', listen: norm_(map['聴解の見出し']) || '聴解',
      speak: norm_(map['スピーキングの見出し']) || 'スピーキング' }
  };
}

function isOn_(v) { return v === true || norm_(v).toUpperCase() === 'TRUE'; }

function findStudent_(code) {
  var c = normCode_(code);
  if (!c || c.length > 40) return null;
  var rows = rows_(SHEET.students, HEAD.students.length);
  for (var i = 0; i < rows.length; i++) {
    if (normCode_(rows[i][0]) === c) return { code: c, name: norm_(rows[i][1]) };
  }
  return null;
}

function allWords_() {
  return rows_(SHEET.words, HEAD.words.length)
    .map(function (r) {
      return { round: normRound_(r[0]), all: norm_(r[1]) === ALL, code: normCode_(r[1]),
        hanzi: norm_(r[2]), pinyin: numToMark_(norm_(r[3])).normalize('NFC'), meaning: norm_(r[4]) };
    })
    .filter(function (w) { return w.hanzi && w.meaning; });
}

function wordsFor_(code, round, pool) {
  var seen = {};
  return (pool || allWords_()).filter(function (w) {
    if (w.round !== round || !(w.all || w.code === code) || seen[w.hanzi]) return false;
    seen[w.hanzi] = true;
    return true;
  });
}

function hasSubmitted_(code, round) {
  var mine = function (r) { return normCode_(r[2]) === code && normRound_(r[1]) === round; };
  return RESULT_SHEETS.some(function (k) { return rows_(SHEET[k], HEAD.subs.length).some(mine); }) ||
    rows_(SHEET.sdetail, HEAD.sdetail.length).some(mine);
}

/** その学生のその回の穴埋め問題。選択肢が2つ未満、または正解の記号が空欄を指す行は出題しない。問題文・選択肢・解説の数字つき拼音は声調記号に直す */
function clozeFor_(code, round) {
  var seen = {}, out = [];
  rows_(SHEET.cloze, HEAD.cloze.length).forEach(function (r) {
    if (normRound_(r[0]) !== round) return;
    var c = norm_(r[1]);
    if (!(c === ALL || normCode_(c) === code)) return;
    var text = pinyinText_(r[2]);
    if (!text || seen[text]) return;
    var options = [], answer = -1, letter = norm_(r[7]).normalize('NFKC').toUpperCase();
    for (var i = 0; i < LETTERS.length; i++) {
      var o = pinyinText_(r[3 + i]);
      if (!o) continue;
      if (LETTERS[i] === letter) answer = options.length;
      options.push(o);
    }
    if (options.length < 2 || answer < 0) return;
    seen[text] = true;
    out.push({ text: text, options: options, answer: answer, note: pinyinText_(r[8]) });
  });
  return out;
}
/** その学生のその回の聴解問題（音声ファイル名・選択肢・正解）。選択肢の拼音は数字表記も声調記号に直す */
function listenFor_(code, round) {
  var seen = {}, out = [];
  rows_(SHEET.listen, HEAD.listen.length).forEach(function (r) {
    if (normRound_(r[0]) !== round) return;
    var c = norm_(r[1]);
    if (!(c === ALL || normCode_(c) === code)) return;
    var file = norm_(r[2]), text = norm_(r[3]);
    if (!file || seen[file + '\n' + text]) return;
    var options = [], answer = -1, letter = norm_(r[8]).normalize('NFKC').toUpperCase();
    for (var i = 0; i < LETTERS.length; i++) {
      var o = numToMark_(norm_(r[4 + i])).normalize('NFC');
      if (!o) continue;
      if (LETTERS[i] === letter) answer = options.length;
      options.push(o);
    }
    if (options.length < 2 || answer < 0) return;
    seen[file + '\n' + text] = true;
    out.push({ file: file, text: text, options: options, answer: answer, note: norm_(r[9]) });
  });
  return out;
}
/** 画面に返す聴解の結果（ファイル名は返さない） */
function listenOut_(list) {
  return (list || []).map(function (q) { return { text: q.text, answer: q.answer, choice: q.choice, ok: q.ok, note: q.note }; });
}
/** その学生のその回のスピーキングの課題。課題・補足の数字つき拼音は声調記号に直す */
function speakFor_(code, round) {
  var seen = {}, out = [];
  rows_(SHEET.speak, HEAD.speak.length).forEach(function (r) {
    if (normRound_(r[0]) !== round) return;
    var c = norm_(r[1]);
    if (!(c === ALL || normCode_(c) === code)) return;
    var text = pinyinText_(r[2]);
    if (!text || seen[text]) return;
    seen[text] = true;
    var sec = Math.round(Number(normRound_(r[5]))) || SPEAK_SEC;
    out.push({ text: text, hint: pinyinText_(r[3]), model: norm_(r[4]), sec: Math.max(5, Math.min(SPEAK_SEC_MAX, sec)) });
  });
  return out;
}
/** 提出された録音を課題の順に並べる → [{mime, ext, bytes} または null]。データがおかしいときは学生向けの文（文字列）を返す */
function recordingsFor_(speak, speakAnswers) {
  var sans = Array.isArray(speakAnswers) ? speakAnswers.slice(0, 500) : [];
  var out = [];
  for (var i = 0; i < speak.length; i++) {
    var a = null;
    for (var k = 0; k < sans.length; k++) {
      var x = sans[k];
      if (x && typeof x === 'object' && Number(x.i) === i) { a = x; break; }
    }
    if (!a || typeof a.data !== 'string' || !a.data) { out.push(null); continue; }
    if (a.data.length > AUDIO_MAX * 4 / 3 + 8) return '録音が長すぎて送れませんでした。短めに録り直してから提出してください。';
    var bytes;
    try { bytes = Utilities.base64Decode(a.data); } catch (e) { bytes = null; }
    if (!bytes || !bytes.length) return '録音のデータを読み取れませんでした。録り直してから提出してください。';
    var mime = norm_(a.mime).split(';')[0].trim().toLowerCase();
    if (!REC_EXT[mime]) mime = 'audio/webm';
    out.push({ mime: mime.replace(/^video\//, 'audio/').replace('audio/x-m4a', 'audio/mp4'), ext: REC_EXT[mime], bytes: bytes });
  }
  return out;
}
/** 録音を「録音フォルダ」の中の回ごとのフォルダに保存し、ファイルのURLを課題の順に返す（録音のない課題は空） */
function saveRecordings_(s, st, recs) {
  if (!recs.some(function (x) { return x; })) return recs.map(function () { return ''; });
  ensureSettingRows_();
  var ref = s.recFolder || ensureRecFolder_();
  var root = DriveApp.getFolderById(folderId_(ref));
  var name = '第' + s.round + '回', it = root.getFoldersByName(name);
  var dir = it.hasNext() ? it.next() : root.createFolder(name);
  return recs.map(function (x, i) {
    if (!x) return '';
    var file = '第' + s.round + '回_' + (st.name || st.code).replace(/[\\/:*?"<>|]/g, '_') + '_' + st.code + '_' + (i + 1) + '.' + x.ext;
    return dir.createFile(Utilities.newBlob(x.bytes, x.mime, file)).getUrl();
  });
}
/** 画面に返すスピーキングの結果（提出の直後。評価はまだない） */
function speakOut_(speak, recs) {
  return speak.map(function (q, i) { return { text: q.text, recorded: !!(recs && recs[i]), grade: '', comment: '' }; });
}
/** 「スピーキング提出」の録音のURLからファイルを読み込む */
function recordingData_(url) {
  var m = norm_(url).match(/\/d\/([A-Za-z0-9_-]{10,})/) || norm_(url).match(/[?&]id=([A-Za-z0-9_-]{10,})/);
  if (!m) return null;
  try { return audioData_(DriveApp.getFileById(m[1])); } catch (e) { return null; }
}
/** 音声を添える。読めなかったときは、プレビューなら原因を、学生には一般的な文を出す */
function audioOut_(o, a, detailed) {
  o.audio = a && a.data ? { mime: a.mime, data: a.data } : null;
  o.audioError = o.audio ? '' : detailed ? ((a && a.error) || '音声を読み込めませんでした') : '音声を準備できませんでした。先生に知らせてください。';
  return o;
}

/** 音声フォルダ（中のフォルダも含む）から、名前の一覧のファイルを読み込む → { 名前: {mime, data(base64)} または {error} } */
function loadAudio_(folderRef, names) {
  var out = {}, uniq = [];
  names.forEach(function (n) { if (n && !(n in out)) { out[n] = null; uniq.push(n); } });
  if (!uniq.length) return out;
  var fail = function (msg) { uniq.forEach(function (n) { out[n] = { error: msg }; }); return out; };
  var fid = folderId_(folderRef);
  if (!fid) return fail('「設定」シートの「音声フォルダ」が空か、URLが正しくありません');
  var root;
  try { root = DriveApp.getFolderById(fid); } catch (e) { return fail('音声フォルダを開けませんでした（「設定」の「音声フォルダ」のURLを確認してください）'); }
  var tree = null; // 音声フォルダと、その中のフォルダ（必要になったときに一度だけ調べる）
  var folders = function () {
    if (tree) return tree;
    tree = [root];
    for (var i = 0; i < tree.length && tree.length < AUDIO_MAX_FOLDERS; i++) {
      try {
        var it = tree[i].getFolders();
        while (it.hasNext() && tree.length < AUDIO_MAX_FOLDERS) tree.push(it.next());
      } catch (e) { /* 読めないフォルダは飛ばす */ }
    }
    return tree;
  };
  var cache = null;
  try { cache = CacheService.getScriptCache(); } catch (e) { cache = null; }
  uniq.forEach(function (n) {
    try {
      var key = 'au:' + fid + ':' + fileKey_(n);
      var f = cachedAudioFile_(cache, key, n) || findAudioFile_(root, n, folders);
      if (f && cache) { try { cache.put(key, f.getId(), 21600); } catch (e) { /* キャッシュは使えなくてもよい */ } }
      out[n] = f ? audioData_(f) : { error: '音声ファイル「' + n + '」が音声フォルダ（中のフォルダも含む）にありません' };
    } catch (e) {
      out[n] = { error: '音声ファイル「' + n + '」を読み込めませんでした' };
    }
  });
  return out;
}
var AUDIO_MAX_FOLDERS = 50; // 音声フォルダの中を探すフォルダの数の上限
function folderId_(v) {
  var s = norm_(v), m = s.match(/folders\/([A-Za-z0-9_-]{10,})/) || s.match(/[?&]id=([A-Za-z0-9_-]{10,})/);
  if (m) return m[1];
  return /^[A-Za-z0-9_-]{10,}$/.test(s) ? s : '';
}
function fileKey_(n) { return norm_(n).normalize('NFKC').toLowerCase(); }
function baseName_(n) { return fileKey_(n).replace(/\.[a-z0-9]{1,5}$/, ''); }
/** 前に見つけたファイル（6時間覚えておく）。消された・名前が変わったときは使わない */
function cachedAudioFile_(cache, key, name) {
  if (!cache) return null;
  try {
    var id = cache.get(key);
    if (!id) return null;
    var f = DriveApp.getFileById(id);
    if (f.isTrashed() || baseName_(f.getName()) !== baseName_(name)) return null;
    return f;
  } catch (e) { return null; }
}
/** 一覧から、名前が一致するファイル（拡張子は省略可）を選ぶ */
function pickAudioFile_(it, limit, name) {
  var want = fileKey_(name), wantBase = baseName_(name), best = null, n = 0;
  while (it.hasNext() && n++ < limit) {
    var f = it.next();
    if (f.isTrashed && f.isTrashed()) continue;
    var k = fileKey_(f.getName());
    if (k === want) return f;
    if (!best && baseName_(k) === wantBase) best = f;
  }
  return best;
}
/** 1つのフォルダの中を名前で検索する（完全一致 → 前方一致） */
function searchAudioIn_(folder, name) {
  var raw = norm_(name), esc = function (t) { return t.replace(/["\\]/g, '\\$&'); };
  var base = raw.replace(/\.[A-Za-z0-9]{1,5}$/, '');
  var titles = base === raw ? [raw].concat(Object.keys(AUDIO_MIME).map(function (e) { return raw + '.' + e; })) : [raw];
  try {
    var q = '(' + titles.map(function (t) { return 'title = "' + esc(t) + '"'; }).join(' or ') + ') and trashed = false';
    var hit = pickAudioFile_(folder.searchFiles(q), 50, name);
    if (hit) return hit;
  } catch (e) { /* 次の方法で探す */ }
  try { return pickAudioFile_(folder.searchFiles('title contains "' + esc(base) + '" and trashed = false'), 300, name); }
  catch (e) { return null; }
}
/** 音声フォルダの直下 → 中のフォルダ の順に探す。検索が使えないときはフォルダの中を順に見る */
function findAudioFile_(root, name, folders) {
  var hit = searchAudioIn_(root, name);
  if (hit) return hit;
  var list = folders(), i;
  for (i = 1; i < list.length; i++) { hit = searchAudioIn_(list[i], name); if (hit) return hit; }
  var budget = 3000;
  for (i = 0; i < list.length && budget > 0; i++) {
    try { hit = pickAudioFile_(list[i].getFiles(), budget, name); } catch (e) { hit = null; }
    if (hit) return hit;
    budget -= 1000;
  }
  return null;
}
function audioData_(f) {
  if (f.getSize() > AUDIO_MAX) return { error: '音声ファイル「' + f.getName() + '」が大きすぎます（3MBまで）' };
  var ext = ((f.getName().match(/\.([A-Za-z0-9]{1,5})$/) || [])[1] || '').toLowerCase();
  var type = norm_(f.getMimeType());
  var mime = AUDIO_MIME[ext] || (/^(audio|video)\//.test(type) ? type : '');
  if (!mime) return { error: '「' + f.getName() + '」は音声ファイルではないようです' };
  if (mime === 'video/mp4' || mime === 'audio/x-m4a') mime = 'audio/mp4';
  return { mime: mime, data: Utilities.base64Encode(f.getBlob().getBytes()) };
}

function unCell_(v) { var s = norm_(v); return /^'[=+\-@]/.test(s) ? s.slice(1) : s; } // safeCell_ で付けた ' を外す

/** その学生のその回の読解（本文と設問）。正解の記号が正しくない設問は出題しない */
function readingFor_(code, round) {
  var qs = {};
  rows_(SHEET.rq, HEAD.rq.length).forEach(function (r) {
    var pid = norm_(r[0]), text = pinyinText_(r[1]);
    if (!pid || !text) return;
    var options = [], answer = -1, letter = norm_(r[6]).normalize('NFKC').toUpperCase();
    for (var i = 0; i < LETTERS.length; i++) {
      var o = pinyinText_(r[2 + i]);
      if (!o) continue;
      if (LETTERS[i] === letter) answer = options.length;
      options.push(o);
    }
    if (options.length < 2 || answer < 0) return;
    (qs[pid] || (qs[pid] = [])).push({ text: text, options: options, answer: answer });
  });
  var seen = {}, out = [];
  rows_(SHEET.rtext, HEAD.rtext.length).forEach(function (r) {
    var pid = norm_(r[2]);
    if (!pid || seen[pid] || normRound_(r[0]) !== round) return;
    var c = norm_(r[1]);
    if (!(c === ALL || normCode_(c) === code)) return;
    if (!norm_(r[4]) || !qs[pid]) return;
    seen[pid] = true;
    out.push({ pid: pid, title: pinyinText_(r[3]), text: pinyinText_(r[4]), notes: splitNotes_(r[5]), questions: qs[pid] });
  });
  return out;
}
function splitNotes_(v) {
  return norm_(v).split(/\r?\n/).map(function (x) { return pinyinText_(x); }).filter(function (x) { return x; });
}
function ensureSheet_(name, head) {
  var sh = sheet_(name);
  if (sh) return sh;
  sh = ss_().insertSheet(name);
  sh.getRange(1, 1, 1, head.length).setValues([head]);
  sh.getRange('A:A').setNumberFormat('yyyy/MM/dd HH:mm');
  if (head[6] === '正答率') sh.getRange('G:G').setNumberFormat('0%');
  styleHeader_(sh, head.length);
  return sh;
}
function writeRows_(name, head, rows) { // appendRow だと日時の表示形式が上書きされるため setValues を使う
  if (!rows.length) return;
  var sh = ensureSheet_(name, head);
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, head.length).setValues(rows);
}

function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }
function sheet_(name) { return ss_().getSheetByName(name); }
function rows_(name, width) {
  var sh = sheet_(name);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, width).getValues();
}
function norm_(v) { return String(v == null ? '' : v).trim(); }
function normCode_(v) { return norm_(v).normalize('NFKC').toLowerCase(); } // 全角入力も受け付ける
function normRound_(v) { return norm_(v).normalize('NFKC'); }
function fmtDate_(d) { return d instanceof Date ? Utilities.formatDate(d, TZ, 'yyyy/MM/dd HH:mm') : norm_(d); }
function fail_(msg) { return { ok: false, error: msg }; }
function safeCell_(s) { return /^[=+\-@]/.test(s) ? "'" + s : s; } // 数式として解釈されないようにする
function randomCode_() {
  var s = '';
  for (var i = 0; i < CODE_LEN; i++) s += CODE_CHARS.charAt(Math.floor(Math.random() * CODE_CHARS.length));
  return s;
}
function shuffle_(a) {
  for (var i = a.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}
function styleHeader_(sh, n) {
  sh.getRange(1, 1, 1, n).setFontWeight('bold').setBackground('#e8eef0');
  sh.setFrozenRows(1);
}
function alert_(msg) { try { SpreadsheetApp.getUi().alert(msg); } catch (e) { console.log(msg); } } // エディタから実行したときは画面に出せないのでログへ
