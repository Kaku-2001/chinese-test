/*
 * apps-script/Code.gs の動作確認（tools/gas-sim.js で手元で動かします。本物のシートには触りません）。
 * アプリ（index.html）と同じ呼び出し方で、プレビュー → 受験 → 提出 → 結果 の流れを確かめます。
 * 使い方: node tools/test-gas.js
 */
var assert = require('assert');
var sim = require('./gas-sim');

var PREVIEW = 'pvtest1', STUDENT = 'abc234';
function tables() {
  return {
    '設定': [['項目', '値', '説明'], ['講座名', 'テスト講座', ''], ['今週の回', 1, ''], ['受付', true, ''], ['プレビュー用コード', PREVIEW, '']],
    '学生': [['コード', '表示名', 'メモ'], [STUDENT, 'テスト学生', '']],
    '語リスト': [['回', 'コード', '簡体字', '拼音', '意味'],
      [1, '全員', '你好', 'ni3 hao3', 'こんにちは'], [1, '全員', '谢谢', 'xie4xie', 'ありがとう'],
      [1, '全員', '老师', 'lao3shi1', '先生'], [1, '全員', '朋友', 'peng2you', '友達']],
    '読解本文': [['回', 'コード', '本文番号', 'タイトル', '本文', '語注'],
      [1, '全員', 'p1', 'Qing1chao3 xi1hu2lu2', '把西葫芦qu4pi2。A4の紙、mp3、iPhone15、5G、B2B、COVID19。', '去皮qu4pi2 皮をむく\n好吃 hao3chi1 おいしい']],
    '読解設問': [['本文番号', '設問', 'A', 'B', 'C', 'D', '正解'],
      ['p1', '「qu4pi2」の意味は？', 'pi2をむく', '切る', 'qie1る', 'zhu3', 'A'],
      ['p1', '本文に出てくるのは？', 'A4の紙', 'mp3', 'B2B', 'iPhone15', 'B']],
    '穴埋め': [['回', 'コード', '問題文', 'A', 'B', 'C', 'D', '正解', '解説'],
      ['例', '全員', '见本（　）', 'a', 'b', '', '', 'A', ''],
      [1, '全員', '我昨天买了一（　）新衣服。', '条', '件', '本', '张', 'B', '衣服の量詞は「件」'],
      [1, '全員', '你好的拼音是 ni3（　）。', 'hao3', 'hao4', 'hao1', 'hao2', 'A', '你好 ni3hao3：第3声が続く']],
    '聴解': [['回', 'コード', '音声ファイル名', '問題文', 'A', 'B', 'C', 'D', '正解', '解説'],
      [1, '全員', 'ma1', '声調を選んでください', 'ma1', 'ma2', 'ma3', 'ma4', 'A', '']]
  };
}

// 正解を選んだ答案をつくる（単語は正解がわからないので、1つ目の選択肢を選ぶ）
function answersFor(t) {
  return [
    t.questions.map(function (q) { return { type: q.type, prompt: q.prompt, choice: q.options[0] }; }),
    [{ pid: 'p1', qi: 0, choice: 'píをむく' }, { pid: 'p1', qi: 1, choice: 'mp3' }],
    [{ text: t.cloze[0].text, choice: '件' }, { text: t.cloze[1].text, choice: 'hǎo' }],
    [{ i: 0, choice: 'mā' }]
  ];
}

var gs = sim.load(tables());

// 1) プレビュー：問題の回の一覧
var st = gs.call('api_status', PREVIEW);
assert.ok(st.ok && st.preview, JSON.stringify(st));
assert.ok(st.rounds.indexOf('1') >= 0);

// 2) プレビューで受験：読解・穴埋めの数字つき拼音だけが声調記号になり、正解は送られない
var t = gs.call('api_start', PREVIEW, { round: '1' });
assert.ok(t.ok, JSON.stringify(t));
var p = t.reading[0];
assert.strictEqual(p.title, 'Qīngchǎo xīhúlú');
assert.strictEqual(p.text, '把西葫芦qùpí。A4の紙、mp3、iPhone15、5G、B2B、COVID19。');
assert.deepStrictEqual(p.notes, ['去皮qùpí 皮をむく', '好吃 hǎochī おいしい']);
assert.strictEqual(p.questions[0].text, '「qùpí」の意味は？');
assert.deepStrictEqual(p.questions[0].options, ['píをむく', '切る', 'qiēる', 'zhǔ']);
assert.deepStrictEqual(p.questions[1].options, ['A4の紙', 'mp3', 'B2B', 'iPhone15']);
assert.strictEqual(t.cloze[1].text, '你好的拼音是 nǐ（　）。');
assert.deepStrictEqual(t.cloze[1].options, ['hǎo', 'hào', 'hāo', 'háo']);
assert.strictEqual(t.questions.length, 4);
assert.deepStrictEqual(t.listen[0].options, ['mā', 'má', 'mǎ', 'mà']);
assert.ok(!/"answer"/.test(JSON.stringify(t)), '提出前に正解が送られている');

// 3) プレビューで提出：採点はされるが、何も記録されない
var a = answersFor(t);
var r = gs.call('api_submit', PREVIEW, '1', a[0], a[1], { round: '1' }, a[2], a[3]);
assert.ok(r.ok && r.result.preview, JSON.stringify(r));
assert.deepStrictEqual(r.result.reading[0].questions.map(function (q) { return q.ok; }), [true, true]);
assert.deepStrictEqual(r.result.cloze.map(function (q) { return q.ok; }), [true, true]);
assert.strictEqual(r.result.cloze[1].note, '你好 nǐhǎo：第3声が続く');
assert.ok(r.result.listen[0].ok);
['提出', '読解提出', '穴埋め提出', '聴解提出'].forEach(function (n) {
  assert.ok(!gs.sheets[n] || gs.sheets[n].length <= 1, n + ' に記録されている');
});

// 4) 学生として受験・提出・結果
st = gs.call('api_status', STUDENT);
assert.ok(st.ok && !st.submitted && st.countReading === 2 && st.countCloze === 2 && st.countListen === 1, JSON.stringify(st));
t = gs.call('api_start', STUDENT);
a = answersFor(t);
r = gs.call('api_submit', STUDENT, '1', a[0], a[1], null, a[2], a[3]);
assert.ok(r.ok && !r.result.preview, JSON.stringify(r));
assert.deepStrictEqual(r.result.reading[0].questions.map(function (q) { return q.ok; }), [true, true]);
var rd = gs.sheets['読解明細'];
assert.strictEqual(rd.length, 3);
assert.strictEqual(rd[1][5], '「qùpí」の意味は？');
assert.strictEqual(rd[1][6], 'píをむく');
assert.strictEqual(rd[1][8], '○');
var cd = gs.sheets['穴埋め明細'];
assert.strictEqual(cd.length, 3);
assert.deepStrictEqual(cd[2].slice(4), ['你好的拼音是 nǐ（　）。', 'hǎo', 'hǎo', '○']);

var res = gs.call('api_result', STUDENT, '1');
assert.ok(res.ok, JSON.stringify(res));
assert.strictEqual(res.result.reading[0].title, 'Qīngchǎo xīhúlú');
assert.deepStrictEqual(res.result.reading[0].notes, ['去皮qùpí 皮をむく', '好吃 hǎochī おいしい']);
assert.deepStrictEqual(res.result.reading[0].questions.map(function (q) { return q.ok; }), [true, true]);
assert.deepStrictEqual(res.result.cloze.map(function (q) { return [q.ok, q.note]; }),
  [[true, '衣服の量詞は「件」'], [true, '你好 nǐhǎo：第3声が続く']]);
assert.strictEqual(res.result.total, 4 + 2 + 2 + 1);

// 拼音を直す前に記録された行（問題文が数字のまま）でも、結果画面に解説が出る
cd[2][4] = '你好的拼音是 ni3（　）。';
res = gs.call('api_result', STUDENT, '1');
assert.strictEqual(res.result.cloze[1].note, '你好 nǐhǎo：第3声が続く');

// 5) 同じ回は2回提出できない
st = gs.call('api_status', STUDENT);
assert.ok(st.submitted);
r = gs.call('api_submit', STUDENT, '1', a[0], a[1], null, a[2], a[3]);
assert.ok(!r.ok && /提出済み/.test(r.error), JSON.stringify(r));
assert.strictEqual(gs.sheets['読解明細'].length, 3);

// 前の画面（doGet）：スピーキングのシートがなければ、今までどおりの画面
assert.strictEqual(gs.ctx.doGet().html, 'TEMPLATE:Index');

// 6) スピーキング：指定した拼音を発音して録音し、ドライブに保存して、先生の評価を結果に出す
var tb = tables();
tb['スピーキング'] = [['回', 'コード', '課題', '補足', 'お手本', '秒'],
  ['例', '全員', '见本', '', '', ''],
  [1, '全員', 'ni3hao3', '你好', 'nihao', 30],
  [1, '全員', 'lv4 nv3', 'ü の発音', '', 999],
  [2, '全員', '第2回は話すだけ', '', '', '']];
gs = sim.load(tb);
st = gs.call('api_status', STUDENT);
assert.ok(st.ok && st.countSpeak === 2 && st.count === 4 + 2 + 2 + 1 + 2, JSON.stringify(st));
t = gs.call('api_start', STUDENT);
assert.deepStrictEqual(t.speak, [{ text: 'nǐhǎo', hint: '你好', sec: 30 }, { text: 'lǜ nǚ', hint: 'ü の発音', sec: 180 }]); // お手本はテスト中には送らない
var rec = Buffer.from('fake-recording').toString('base64');
// 壊れたデータは、何も記録せずに断る
r = gs.call('api_submit', STUDENT, '1', [], [], null, [], [], [{ i: 0, mime: 'audio/webm', data: '%%%' }]);
assert.ok(!r.ok && /録り直/.test(r.error), JSON.stringify(r));
assert.ok(!gs.sheets['スピーキング提出'] || gs.sheets['スピーキング提出'].length <= 1);
assert.ok(!gs.call('api_status', STUDENT).submitted);
// プレビューは保存しない
r = gs.call('api_submit', PREVIEW, '1', [], [], { round: '1' }, [], [], [{ i: 0, mime: 'audio/webm;codecs=opus', data: rec }]);
assert.ok(r.ok && r.result.preview, JSON.stringify(r));
assert.deepStrictEqual(r.result.speak.map(function (q) { return q.recorded; }), [true, false]);
assert.ok(/音声フォルダ/.test(r.result.speak[0].modelError), JSON.stringify(r.result.speak[0])); // プレビューでは、お手本を読めない理由を出す
assert.ok(!('modelError' in r.result.speak[1]));
assert.strictEqual(Object.keys(gs.drive.files).length, 0);
// 学生の提出：1つ目だけ録音あり
r = gs.call('api_submit', STUDENT, '1', [], [], null, [], [], [{ i: 0, mime: 'audio/mp4', data: rec }]);
assert.ok(r.ok, JSON.stringify(r));
var files = Object.keys(gs.drive.files).map(function (k) { return gs.drive.files[k]; });
assert.strictEqual(files.length, 1);
assert.strictEqual(files[0].name, '第1回_テスト学生_' + STUDENT + '_1.m4a');
assert.strictEqual(Buffer.from(files[0].bytes).toString(), 'fake-recording');
assert.strictEqual(gs.drive.folders[files[0].folder].name, 'テスト学生_' + STUDENT); // 学生ごとのフォルダ
var setRow = gs.sheets['設定'].filter(function (x) { return x[0] === '録音フォルダ'; })[0];
assert.ok(setRow && /folders\//.test(setRow[1]), '録音フォルダが「設定」に書かれていない');
var sd = gs.sheets['スピーキング提出'];
assert.strictEqual(sd.length, 3);
assert.deepStrictEqual(sd[1].slice(4), ['nǐhǎo', files[0].api.getUrl(), '', '']);
assert.deepStrictEqual(sd[2].slice(4), ['lǜ nǚ', '（録音なし）', '', '']);
// 先生が評価を書くと、結果画面に出る（スピーキングは点数に入らない）
sd[1][6] = '8/10'; sd[1][7] = '声調がきれいです';
res = gs.call('api_result', STUDENT, '1');
assert.ok(res.ok, JSON.stringify(res));
assert.strictEqual(res.result.total, 4 + 2 + 2 + 1); // 点数は単語・読解・穴埋め・聴解だけ
assert.deepStrictEqual(res.result.speak.map(function (q) { return [q.text, q.hint, q.recorded, q.grade, q.comment, !!q.audio]; }),
  [['nǐhǎo', '你好', true, '8/10', '声調がきれいです', true], ['lǜ nǚ', 'ü の発音', false, '', '', false]]);
assert.ok(res.result.speak[0].modelError && !/音声フォルダ/.test(res.result.speak[0].modelError)); // 学生には一般的な文だけ
assert.strictEqual(Buffer.from(res.result.speak[0].audio.data, 'base64').toString(), 'fake-recording');
st = gs.call('api_status', STUDENT);
assert.ok(st.submitted && st.history[0].speak === 2, JSON.stringify(st));
r = gs.call('api_submit', STUDENT, '1', [], [], null, [], [], [{ i: 0, mime: 'audio/mp4', data: rec }]);
assert.ok(!r.ok && /提出済み/.test(r.error));
// 次の回も同じ学生のフォルダに入る
gs.sheets['設定'][2][1] = 2;
r = gs.call('api_submit', STUDENT, '2', [], [], null, [], [], [{ i: 0, mime: 'audio/webm', data: rec }]);
assert.ok(r.ok, JSON.stringify(r));
var f2 = Object.keys(gs.drive.files).map(function (k) { return gs.drive.files[k]; }).filter(function (f) { return /^第2回/.test(f.name); });
assert.strictEqual(f2.length, 1);
assert.strictEqual(f2[0].folder, files[0].folder);
gs.sheets['設定'][2][1] = 1;
// スピーキングだけの回：プレビューの回の一覧に出る
assert.ok(gs.call('api_status', PREVIEW).rounds.indexOf('2') >= 0);
t = gs.call('api_start', PREVIEW, { round: '2' });
assert.ok(t.ok && t.speak.length === 1 && t.speak[0].sec === 20, JSON.stringify(t));

// スピーキングのシートがあるクラスでは、前の画面はアプリへの案内だけになる
var g = gs.ctx.doGet().html;
assert.ok(/テストはアプリで受けてください/.test(g) && /先生から届いたアプリのURL/.test(g), g);
gs.sheets['設定'].push(['アプリのURL', 'https://example.github.io/app/?c=x&y="1"', '']);
g = gs.ctx.doGet().html;
assert.ok(g.indexOf('href="https://example.github.io/app/?c=x&amp;y=&quot;1&quot;" target="_top"') >= 0, g);

// 「コード」欄に何人分も書ける（「,」「、」「，」やスペースで区切る）。書いていない学生には出ない
tb = tables();
tb['学生'].push(['def567', '学生2', ''], ['ghi890', '学生3', '']);
tb['語リスト'].push([1, 'ABC234, def567', '吃饭', 'chi1 fan4', 'ご飯を食べる'], [1, 'def567、ghi890', '学习', 'xue2xi2', '勉強する'],
  [1, 'abc2345', '明天', 'ming2tian1', '明日']);
tb['穴埋め'].push([1, 'ｄｅｆ５６７　abc234', '他（　）了。', '来', '去', '', '', 'A', '']);
tb['聴解'].push([1, 'abc234，ghi890', 'ma2', '', 'ma1', 'ma2', '', '', 'B', '']);
tb['スピーキング'] = [['回', 'コード', '課題', '補足', 'お手本', '秒'], [1, 'abc234,def567', 'ni3hao3', '', '', ''], [1, 'ghi890', 'xie4xie', '', '', '']];
gs = sim.load(tb);
function counts(code) {
  var x = gs.call('api_status', code);
  assert.ok(x.ok, JSON.stringify(x));
  return [x.countWords, x.countCloze, x.countListen, x.countReading, x.countSpeak];
}
assert.deepStrictEqual(counts(STUDENT), [5, 3, 2, 2, 1]);
assert.deepStrictEqual(counts('def567'), [6, 3, 1, 2, 1]);
assert.deepStrictEqual(counts('ghi890'), [5, 2, 2, 2, 1]);
t = gs.call('api_start', PREVIEW, { round: '1', as: 'def567' });
assert.ok(t.ok && t.questions.length === 6 && t.cloze.length === 3 && t.listen.length === 1, JSON.stringify(t)); // プレビューで学生を選んだときも同じ

console.log('OK   apps-script/Code.gs（手元のシミュレーション）');
