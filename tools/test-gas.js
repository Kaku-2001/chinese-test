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

console.log('OK   apps-script/Code.gs（手元のシミュレーション）');
