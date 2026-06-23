// ストーリー記憶配列（左手 = モード、右手 = 文字インデックス）
// グローバルキー（優先判定）: 
//   - 左手Zero && 右手Zero = backspace（最優先）
//   - 右手Thumb = space（左手は問わない）
// 文字マッピング: 左手モード × 右手インデックス
function getCharacterFromGestures(leftGesture, rightGesture) {
  // 最優先: 両手Zeroでbackspace
  if (leftGesture === "Zero" && rightGesture === "Zero") {
    return "BACK";  // Backキー（1文字取り消し）
  }

  // グローバルキー: 右手Thumbでspace（左手は問わない）
  if (rightGesture === "Thumb") {
    return " ";  // スペースキー
  }

  // 文字マッピング（左手モード × 右手インデックス）
  // ※FiveとThumbの役割を入れ替え済み
  const keymap = {
    "Zero":   { "One": 't', "Two": 'h', "Three": 'e' },
    "One":    { "One": 'q', "Two": 'u', "Three": 'i', "Four": 'c', "Five": 'k' },
    "Two":    { "One": 'b', "Two": 'r', "Three": 'o', "Four": 'w', "Five": 'n' },
    "Three":  { "One": 'f', "Two": 'x', "Three": 'j', "Four": 'm', "Five": 'p' },
    "Four":   { "One": 's', "Two": 'v' },
    "Five":   { "One": 'l', "Two": 'a', "Three": 'z', "Four": 'y' },
    "Thumb":  { "One": 'd', "Two": 'g' }
  };
  
  // 左手のモードが存在し、かつ右手の文字がマップに存在するかチェック
  if (keymap[leftGesture] && keymap[leftGesture][rightGesture]) {
    return keymap[leftGesture][rightGesture];
  }
  return "";
}

// 入力サンプル文章 
let sample_texts = [
  "the quick brown fox jumps over the lazy dog",
];

// グローバル変数：チャタリング防止用
let lastChar = "";

// グローバル変数：両手Zero時の連続backspace処理用
let lastBackspaceTime = 0;  // 前回のbackspace実行時刻
const BACKSPACE_INTERVAL = 500;  // 0.5秒 = 500ms

// グローバル変数：ジェスチャー継続時間判定用
let lastGestureSet = { left: "", right: "" };  // 前フレームのジェスチャーペア
let gestureStartTime = 0;  // 現在のジェスチャーペアが認識され始めた時刻
const GESTURE_HOLD_TIME = 200;  // 0.2秒 = 200ms

// ゲームの状態を管理する変数
// notready: ゲーム開始前 （カメラ起動前）
// ready: ゲーム開始前（カメラ起動後）
// playing: ゲーム中
// finished: ゲーム終了後
// ready, playing, finished
let game_mode = {
  now: "notready",
  previous: "notready",
};

let game_start_time = 0;
let gestures_results;
let cam = null;
let p5canvas = null;

function setup() {
  p5canvas = createCanvas(200, 150);
  p5canvas.parent('#canvas');

  // When gestures are found, the following function is called. The detection results are stored in results.
  gotGestures = function (results) {
    gestures_results = results;

    if (results.gestures.length == 2) {
      if (game_mode.now == "ready" && game_mode.previous == "notready") {
        // ゲーム開始前の状態から、カメラが起動した後の状態に変化した場合
        game_mode.previous = game_mode.now;
        game_mode.now = "playing";
        document.querySelector('input').value = ""; // 入力欄をクリア
        game_start_time = millis(); // ゲーム開始時間を記録
      }

      // 左右の手を判定し、ジェスチャーを格納
      let leftGesture = "None";
      let rightGesture = "None";

      // 最初の手がRightかLeftかを判定（画像左右反転のため逆転）
      if (results.handedness[0][0].categoryName == "Right") {
        leftGesture = results.gestures[0][0].categoryName;
        rightGesture = results.gestures[1][0].categoryName;
      } else {
        // 最初の手がLeftの場合、左右を入れ替える
        leftGesture = results.gestures[1][0].categoryName;
        rightGesture = results.gestures[0][0].categoryName;
      }

      // ストーリー記憶配列に基づいて文字を取得
      let currentChar = getCharacterFromGestures(leftGesture, rightGesture);

      // ジェスチャーペアが変わったかチェック
      const currentGestureSet = { left: leftGesture, right: rightGesture };
      const gestureChanged = (lastGestureSet.left !== currentGestureSet.left) || 
                             (lastGestureSet.right !== currentGestureSet.right);

      if (gestureChanged) {
        // ジェスチャーが変わった → 新しいジェスチャーの計測開始
        lastGestureSet = currentGestureSet;
        gestureStartTime = millis();
      }

      // 現在のジェスチャーが0.2秒以上継続しているかチェック
      const currentTime = millis();
      const gestureHoldDuration = currentTime - gestureStartTime;
      const isGestureHeld = gestureHoldDuration >= GESTURE_HOLD_TIME;

      if (isGestureHeld) {
        // 特別処理1：左手Zero && 右手Zeroの場合、0.5秒ごとにbackspaceを実行
        if (leftGesture === "Zero" && rightGesture === "Zero") {
          if (currentTime - lastBackspaceTime >= BACKSPACE_INTERVAL) {
            typeChar("BACK");
            lastBackspaceTime = currentTime;
          }
        } 
        // 特別処理2：左手Thumb && 右手Thumbの場合、0.5秒ごとにスペースを実行
        else if (leftGesture === "Thumb" && rightGesture === "Thumb") {
          if (currentTime - lastBackspaceTime >= BACKSPACE_INTERVAL) {
            typeChar(" ");
            lastBackspaceTime = currentTime;
          }
        } 
        // 通常処理：それ以外の場合、1回だけ入力
        else {
          if (currentChar !== "" && currentChar !== lastChar) {
            typeChar(currentChar);
            lastChar = currentChar;
          }
        }
      }
    } else {
      // 手が見切れた時、チャタリング防止とタイマーをリセット
      lastChar = "";
      lastBackspaceTime = 0;
      lastGestureSet = { left: "", right: "" };
      gestureStartTime = 0;
    }

  }
}

// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
// ここから下は課題制作にあたって編集してはいけません。
// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

// 入力欄に文字を追加する場合は必ずこの関数を使用してください。
function typeChar(c) {
  if (c === "") {
    console.warn("Empty character received, ignoring.");
    return;
  }
  // inputにフォーカスする
  document.querySelector('input').focus();
  // 入力欄に文字を追加または削除する関数
  const input = document.querySelector('input');
  
  // BACK処理: 1文字取り消し
  if (c === "BACK") {
    input.value = input.value.slice(0, -1);
  } else {
    // 通常文字の追加
    input.value += c;
  }

  let inputValue = input.value;
  // #messageのinnerTextを色付けして表示
  const messageElem = document.querySelector('#message');
  const target = messageElem.innerText;
  let matchLen = 0;
  for (let i = 0; i < Math.min(inputValue.length, target.length); i++) {
    if (inputValue[i] === target[i]) {
      matchLen++;
    } else {
      break;
    }
  }
  const matched = target.slice(0, matchLen);
  const unmatched = target.slice(matchLen);
  console.log(`Matched: ${matched}, Unmatched: ${unmatched}`);
  messageElem.innerHTML =
    `<span style="background-color:lightgreen">${matched}</span><span style="background-color:transparent">${unmatched}</span>`;




  // もしvalueの値がsample_texts[0]と同じになったら、[0]を削除して、次のサンプル文章に移行する。配列長が0になったらゲームを終了する
  if (document.querySelector('input').value == sample_texts[0]) {
    sample_texts.shift(); // 最初の要素を削除
    console.log(sample_texts.length);
    if (sample_texts.length == 0) {
      // サンプル文章がなくなったらゲーム終了
      game_mode.previous = game_mode.now;
      game_mode.now = "finished";
      document.querySelector('input').value = "";
      const elapsedSec = ((millis() - game_start_time) / 1000).toFixed(2);
      document.querySelector('#message').innerText = `Finished: ${elapsedSec} sec`;
    } else {
      // 次のサンプル文章に移行
      document.querySelector('input').value = "";
      document.querySelector('#message').innerText = sample_texts[0];
    }
  }

}


function startWebcam() {
  // If the function setCameraStreamToMediaPipe is defined in the window object, the camera stream is set to MediaPipe.
  if (window.setCameraStreamToMediaPipe) {
    cam = createCapture(VIDEO);
    cam.hide();
    cam.elt.onloadedmetadata = function () {
      window.setCameraStreamToMediaPipe(cam.elt);
    }
    p5canvas.style('width', '100%');
    p5canvas.style('height', 'auto');
  }

  if (game_mode.now == "notready") {
    game_mode.previous = game_mode.now;
    game_mode.now = "ready";
    document.querySelector('#message').innerText = sample_texts[0];
    game_start_time = millis();
  }
}


function draw() {
  background(127);
  if (cam) {
    push();
    translate(width, 0);
    scale(-1, 1);
    image(cam, 0, 0, width, height);
    pop();
  }
  // 各頂点座標を表示する
  // 各頂点座標の位置と番号の対応は以下のURLを確認
  // https://developers.google.com/mediapipe/solutions/vision/hand_landmarker
  if (gestures_results) {
    if (gestures_results.landmarks) {
      for (const landmarks of gestures_results.landmarks) {
        for (let landmark of landmarks) {
          noStroke();
          fill(100, 150, 210);
          circle(width - landmark.x * width, landmark.y * height, 10);
        }
      }
    }

    // ジェスチャーの結果を表示する
    for (let i = 0; i < gestures_results.gestures.length; i++) {
      noStroke();
      fill(255, 0, 0);
      textSize(10);
      let name = gestures_results.gestures[i][0].categoryName;
      let score = gestures_results.gestures[i][0].score;
      let right_or_left = gestures_results.handednesses[i][0].hand;
      let pos = {
        x: width - gestures_results.landmarks[i][0].x * width,
        y: gestures_results.landmarks[i][0].y * height,
      };
      textSize(20);
      fill(0);
      textAlign(CENTER, CENTER);
      text(name, pos.x, pos.y);
    }
  }

  if (game_mode.now == "notready") {
    // 文字の後ろを白で塗りつぶす
    let msg = "Press the start button to begin";
    textSize(18);
    let tw = textWidth(msg) + 20;
    let th = 32;
    let tx = width / 2;
    let ty = height / 2;
    rectMode(CENTER);
    fill(255, 100);
    noStroke();
    rect(tx, ty, tw, th, 8);
    fill(0);
    textAlign(CENTER, CENTER);
    text(msg, tx, ty);
  }
  else if (game_mode.now == "ready") {
    let msg = "Waiting for gestures to start";
    textSize(18);
    let tw = textWidth(msg) + 20;
    let th = 32;
    let tx = width / 2;
    let ty = height / 2;
    rectMode(CENTER);
    fill(255, 100);
    noStroke();
    rect(tx, ty, tw, th, 8);
    fill(0);
    textAlign(CENTER, CENTER);
    text(msg, tx, ty);
  }
  else if (game_mode.now == "playing") {
    // ゲーム中のメッセージ
    let elapsedSec = ((millis() - game_start_time) / 1000).toFixed(2);
    let msg = `${elapsedSec} [s]`;
    textSize(18);
    let tw = textWidth(msg) + 20;
    let th = 32;
    let tx = width / 2;
    let ty = th;
    rectMode(CENTER);
    fill(255, 100);
    noStroke();
    rect(tx, ty, tw, th, 8);
    fill(0);
    textAlign(CENTER, CENTER);
    text(msg, tx, ty);
  }
  else if (game_mode.now == "finished") {
    // ゲーム終了後のメッセージ
    let msg = "Game finished!";
    textSize(18);
    let tw = textWidth(msg) + 20;
    let th = 32;
    let tx = width / 2;
    let ty = height / 2;
    rectMode(CENTER);
    fill(255, 100);
    noStroke();
    rect(tx, ty, tw, th, 8);
    fill(0);
    textAlign(CENTER, CENTER);
    text(msg, tx, ty);
  }

}


