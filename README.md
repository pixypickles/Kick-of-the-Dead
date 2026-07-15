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
