/*
 * apps-script/Code.gs を手元（Node）で動かすための簡易シミュレーターです。
 * スプレッドシートはメモリ上の表で代わりをします。本物のシートや Google には一切つながりません。
 *
 *   const sim = require('./gas-sim');
 *   const gs = sim.load({ '設定': [['項目', '値', '説明'], ...], '学生': [...], ... });
 *   gs.call('api_start', 'pvtest', { round: '1' });  // アプリと同じく doPost を JSON で往復
 *   gs.sheets['読解明細'];                            // 書き込まれた行（1行目は見出し）
 *
 * Googleドライブもメモリ上の簡易版です（gs.drive.files に作られたファイルが入ります）。
 * 聴解の音声フォルダは中身が空なので、聴解の音声は「読み込めなかった」扱いになります。
 */
var fs = require('fs');
var path = require('path');
var vm = require('vm');

function chain() { // 書式設定など、結果に関係しない呼び出しを受け流す
  return new Proxy({}, { get: function (t, k) { return k === 'build' ? function () { return {}; } : function () { return this; }; } });
}

function makeSheet(rows) {
  var data = rows.map(function (r) { return r.slice(); });
  function width() { return data.reduce(function (m, r) { return Math.max(m, r.length); }, 0); }
  function range(r, c, nr, nc) {
    var rg = chain();
    return new Proxy(rg, { get: function (t, k) {
      if (k === 'getValues') return function () {
        var out = [];
        for (var i = 0; i < nr; i++) {
          var row = data[r - 1 + i] || [], o = [];
          for (var j = 0; j < nc; j++) o.push(row[c - 1 + j] === undefined ? '' : row[c - 1 + j]);
          out.push(o);
        }
        return out;
      };
      if (k === 'setValues') return function (v) {
        v.forEach(function (vr, i) {
          while (data.length < r + i) data.push([]);
          vr.forEach(function (x, j) { data[r - 1 + i][c - 1 + j] = x; });
        });
        return this;
      };
      if (k === 'setValue') return function (x) { return this.setValues([[x]]); };
      return t[k];
    } });
  }
  var sh = chain();
  return { data: data, api: new Proxy(sh, { get: function (t, k) {
    if (k === 'getLastRow') return function () { return data.length; };
    if (k === 'getLastColumn') return width;
    if (k === 'getRange') return function (a, b, c, d) { return typeof a === 'string' ? chain() : range(a, b, c || 1, d || 1); };
    if (k === 'getDataRange') return function () { return range(1, 1, Math.max(data.length, 1), Math.max(width(), 1)); };
    return t[k];
  } }) };
}

function makeDrive() { // フォルダとファイルだけの簡易ドライブ
  var d = { folders: {}, files: {}, n: 0 };
  function iter(list) { var i = 0; return { hasNext: function () { return i < list.length; }, next: function () { return list[i++]; } }; }
  d.folder = function (name, parent) {
    var id = 'folder' + String(++d.n).padStart(8, '0'), kids = [], files = [];
    var api = {
      getId: function () { return id; },
      getName: function () { return name; },
      getUrl: function () { return 'https://drive.google.com/drive/folders/' + id; },
      getFoldersByName: function (n) { return iter(kids.filter(function (k) { return k.getName() === n; })); },
      getFolders: function () { return iter(kids); },
      getFiles: function () { return iter(files.map(function (f) { return d.files[f].api; })); },
      createFolder: function (n) { var f = d.folder(n, id); kids.push(f); return f; },
      createFile: function (blob) {
        var fid = 'file' + String(++d.n).padStart(10, '0');
        var rec = { id: fid, folder: id, name: blob.name, mime: blob.mime, bytes: blob.bytes };
        rec.api = {
          getId: function () { return fid; },
          getName: function () { return rec.name; },
          getUrl: function () { return 'https://drive.google.com/file/d/' + fid + '/view?usp=drivesdk'; },
          getSize: function () { return rec.bytes.length; },
          getMimeType: function () { return rec.mime; },
          isTrashed: function () { return false; },
          getBlob: function () { return { getBytes: function () { return rec.bytes; } }; }
        };
        d.files[fid] = rec; files.push(fid);
        return rec.api;
      }
    };
    d.folders[id] = { name: name, parent: parent || null, api: api };
    return api;
  };
  return d;
}

function load(tables, opts) {
  opts = opts || {};
  var store = {};
  Object.keys(tables || {}).forEach(function (n) { store[n] = makeSheet(tables[n]); });
  var cache = {};
  var drive = makeDrive();
  var ctx = {
    console: console,
    SpreadsheetApp: {
      getActiveSpreadsheet: function () {
        return {
          getSheetByName: function (n) { return store[n] ? store[n].api : null; },
          insertSheet: function (n) { store[n] = makeSheet([]); return store[n].api; }
        };
      },
      getUi: function () { throw new Error('no UI'); },
      flush: function () {},
      newDataValidation: chain
    },
    LockService: { getScriptLock: function () { return { waitLock: function () {}, releaseLock: function () {} }; } },
    CacheService: { getScriptCache: function () {
      return { get: function (k) { return cache[k] || null; }, put: function (k, v) { cache[k] = v; } };
    } },
    DriveApp: {
      createFolder: function (name) { return drive.folder(name); },
      getFolderById: function (id) { if (!drive.folders[id]) throw new Error('no folder ' + id); return drive.folders[id].api; },
      getFileById: function (id) { if (!drive.files[id]) throw new Error('no file ' + id); return drive.files[id].api; }
    },
    Utilities: {
      formatDate: function (d) { return d.toISOString().slice(0, 16).replace('T', ' ').replace(/-/g, '/'); },
      base64Encode: function (b) { return Buffer.from(b).toString('base64'); },
      base64Decode: function (s) {
        if (!/^[A-Za-z0-9+/]*={0,2}$/.test(s)) throw new Error('Invalid base64');
        return Array.from(Buffer.from(s, 'base64'));
      },
      newBlob: function (bytes, mime, name) { return { bytes: bytes, mime: mime, name: name }; }
    },
    HtmlService: {
      createHtmlOutput: function (html) { var o = { html: html, setTitle: function () { return o; }, addMetaTag: function () { return o; } }; return o; },
      createTemplateFromFile: function (n) { return { evaluate: function () { var o = { html: 'TEMPLATE:' + n, setTitle: function () { return o; }, addMetaTag: function () { return o; } }; return o; } }; }
    },
    ContentService: {
      MimeType: { JSON: 'JSON' },
      createTextOutput: function (s) { return { setMimeType: function () { return this; }, getContent: function () { return s; } }; }
    }
  };
  vm.createContext(ctx);
  var file = opts.file || path.join(__dirname, '..', 'apps-script', 'Code.gs');
  vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });

  return {
    ctx: ctx,
    drive: drive,
    sheets: new Proxy({}, { get: function (t, n) { return store[n] ? store[n].data : undefined; } }),
    call: function (fn) {
      var args = Array.prototype.slice.call(arguments, 1);
      var out = ctx.doPost({ postData: { contents: JSON.stringify({ fn: fn, args: args }) } });
      return JSON.parse(out.getContent());
    }
  };
}

module.exports = { load: load };
