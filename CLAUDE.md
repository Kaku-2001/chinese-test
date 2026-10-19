# 中国語講座 単語テスト

学生が受ける単語・読解テストのアプリです。このリポジトリは公開で、GitHub Pages で配信されています。
学生用URL: https://kaku-2001.github.io/chinese-test/?c=<クラスid>

## しくみ

- `index.html`（1ファイルのアプリ）が、`config.js` に書いた各クラスの Apps Script ウェブアプリへ
  `POST`（本文は text/plain の JSON `{"fn": ..., "args": [...]}`）で問い合わせます。
  使う関数: `api_status` / `api_start` / `api_submit` / `api_result`。
- クラスは3つ（`nyumon` 入門 / `joukyu-a` 上級A / `joukyu-b` 上級B）。それぞれ別の Google スプレッドシートと、
  そのシートに紐づいた Apps Script（Code.gs）を持ちます。3クラスとも同じコードです。
- `sw.js` は画面ファイルのキャッシュだけで、テストの通信には関わりません。
  `SHELL` にファイルを足したり画面を大きく変えたときは `CACHE` の版（`vocab-test-v1`）を上げます。
- 問題・受験コード・結果はすべてスプレッドシート側にあります。リポジトリには入れません。

## Apps Script のコード

- Claude からは Apps Script を直接読んだり書き換えたりできません。変更は「Code.gs の全文」を渡し、
  KK さんが3クラスそれぞれに貼り付けて「デプロイ → デプロイを管理 → 鉛筆 → 新バージョン」で反映します
  （この方法ならテストのURLは変わりません）。
- 全文は、push した版の GitHub のページ（コミットを固定したリンク）で渡し、右上のコピーボタン（Copy raw file）で
  コピーしてもらいます。Code.gs は約52KBあり、プロジェクトのチャットの1回の投稿（32KBまで）には入りません。
- 本番と同じコードは `apps-script/Code.gs` に置きます。Apps Script を直すときは必ずこのファイルをもとにし、
  KK さんが本番に貼ったら同じ内容をここにもコミットします。ここが本番とずれると、貼り付けで
  本番の機能（穴埋め・聴解など）を消してしまいます。
- `index.html` が送る引数と Code.gs の受け取る引数は対応しています
  （例: `api_submit(code, round, answers, readingAnswers, opts, clozeAnswers, listenAnswers)`）。
  片方だけ変えるときは、もう片方が古いままでも壊れないようにします。

## 確認のしかた

- push の前に `bash tools/check.sh`（文法チェック、`apps-script/Code.gs` を手元で動かす確認、3クラスの Apps Script が応答するかの確認。どれも何も記録しません）。
- `tools/gas-sim.js` は Code.gs を Node で動かすシミュレーターで、シートをメモリ上の表で代わりにします。
  Code.gs を変えたら、その動きを `tools/test-gas.js` に足して確かめます。
- 中身まで確かめるときは各クラスの「プレビュー用コード」（シートの「設定」タブ）で `api_status` / `api_start` を呼びます。
  プレビューは何も記録しません。`api_submit` は本物の受験コードでは絶対に呼ばないこと（成績が記録されます）。
- プレビュー用コード・受験コード・学生の名前は、このリポジトリ（公開）やコミット、PR に書かないこと。

## 進め方

- 変更はブランチで作り、PR にします。`main` に入ると、すぐ学生の画面に反映されます。
- スプレッドシートは読むだけ。書き込みは KK さんが自分の言葉で頼んだときだけです。
- 文章・コメント・画面の文言は日本語で、学生が読む前提のやさしい言葉にします。
