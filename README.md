# Kick of the Dead v0.2

GitHub Pages向けのHTML5アクションゲーム試作版です。

## GitHubへのアップロード

このZIPを展開し、**中に入っているファイルをすべてリポジトリ直下へアップロード**してください。

重要：`index.html`、`main.js`、`style.css` と各PNG画像が、同じ階層に置かれる構成です。

```text
/
├── index.html
├── main.js
├── style.css
├── neutral.png
├── mid_kick_start.png
├── mid_kick_hit.png
├── low_kick_start.png
├── low_kick_hit.png
├── high_kick_start.png
├── high_kick_hit.png
├── jump.png
├── jump_attack_start.png
├── jump_attack_hit.png
├── landing.png
├── special_pickup.png
└── special_fire.png
```

以前のファイルを残したままでも構いませんが、同名ファイルは上書きしてください。

## 操作

- 左／右：向き変更
- KICK：中段蹴り
- 上＋KICK：上段蹴り
- 下＋KICK：下段蹴り
- JUMP：通常ジャンプ
- 上＋JUMP：高ジャンプ
- 空中KICK：ジャンプ回転蹴り
- SPECIAL：ゲージ100%時にマシンガン

## v0.2の変更

- リポジトリ直下のPNG画像を直接読み込むよう統一
- 画像読み込み失敗時もゲームを継続
- スマホ用タッチ操作
- 敵4種、高さ1〜5
- HP、スコア、必殺ゲージ
- マシンガン必殺技


## v0.3 の変更

- キャラクター画像の外周につながった白背景だけを透過
- 白い道着は輪郭内にあるため、できるだけ残す処理を採用
- 地上蹴りの攻撃範囲を拡大
- 地上蹴りで密集した敵を最大2体まで倒せるよう変更
- ジャンプ攻撃で最大4体まで巻き込めるよう変更
- 敵との接触判定を少し小さく調整
- 被弾後の無敵時間を延長
- 同じ側に敵が詰まりすぎないよう出現間隔を調整


## v0.4 の変更

- 起動時に EASY / NORMAL / HARD の難易度選択画面を追加
- 難易度選択中に画像をバックグラウンド読み込み
- 13枚すべての読み込み完了を待たずにゲーム開始可能
- 未読込モーションは一時的に代替表示
- EASY：HP8、敵速度低下、出現間隔長め、必殺ゲージ増加量アップ
- NORMAL：標準
- HARD：HP3、敵速度上昇、出現間隔短め、必殺ゲージ増加量ダウン
