// ============================================================
// firebase-config.js — Điền thông tin PROJECT FIREBASE CỦA BẠN vào đây.
//
// ----- CÁCH LẤY CÁC GIÁ TRỊ BÊN DƯỚI -----
// 1. Vào https://console.firebase.google.com -> "Add project" -> đặt tên bất kỳ
//    (miễn phí, không cần thẻ tín dụng cho mức dùng của 1 game nhỏ).
// 2. Trong project vừa tạo: vào mục "Build" > "Realtime Database" > "Create Database"
//    -> chọn 1 vùng gần bạn -> chọn "Start in test mode" (sẽ siết lại rule ở bước 4).
// 3. Vào biểu tượng bánh răng > "Project settings" > kéo xuống "Your apps" >
//    bấm icon Web "</>" để tạo 1 Web app (đặt tên bất kỳ, KHÔNG cần Firebase Hosting).
//    Firebase sẽ hiện ra 1 đoạn "firebaseConfig" y hệt cấu trúc bên dưới -> copy đè
//    vào đây.
// 4. Vào lại "Realtime Database" > tab "Rules" -> dán đoạn JSON sau rồi bấm "Publish"
//    (rule này cho phép AI CŨNG ĐỌC ĐƯỢC bảng xếp hạng, nhưng chỉ nhận ghi dữ liệu
//    ĐÚNG ĐỊNH DẠNG — chặn bớt dữ liệu rác/hỏng, không chặn được gian lận giá trị
//    hợp lệ vì đây là game không có server xác thực):
//
//   {
//     "rules": {
//       "leaderboard": {
//         ".read": true,
//         ".write": true,
//         "$entryId": {
//           ".validate": "newData.hasChildren(['level','timeMs','names','date']) && newData.child('level').isNumber() && newData.child('level').val() >= 1 && newData.child('level').val() <= 3 && newData.child('timeMs').isNumber() && newData.child('timeMs').val() >= 0 && newData.child('timeMs').val() < 3600000 && newData.child('names').hasChildren() && newData.child('date').isNumber()"
//         }
//       },
//       "$other": { ".read": false, ".write": false }
//     }
//   }
//
// Sau khi điền xong 7 giá trị bên dưới và deploy lại trang, mọi người chơi trên
// MỌI trình duyệt/máy sẽ dùng chung 1 bảng xếp hạng, tự cập nhật real-time.
// ============================================================

const firebaseConfig = {
  apiKey: "AIzaSyCgc3g5SCKCagiau-WXiAQyG3etKgph2Is",
  authDomain: "supersmicwar.firebaseapp.com",
  databaseURL: "https://supersmicwar-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "supersmicwar",
  storageBucket: "supersmicwar.firebasestorage.app",
  messagingSenderId: "285210980681",
  appId: "1:285210980681:web:1818d7d66ea43c49cd2a98"
};

let leaderboardDB = null;
try {
  if (firebaseConfig.apiKey && firebaseConfig.apiKey !== 'YOUR_API_KEY' && typeof firebase !== 'undefined') {
    firebase.initializeApp(firebaseConfig);
    leaderboardDB = firebase.database();
  } else {
    console.warn('[firebase-config] Chưa điền firebaseConfig thật -> bảng xếp hạng sẽ không hoạt động. Xem hướng dẫn ở đầu file js/firebase-config.js.');
  }
} catch (e) {
  console.warn('[firebase-config] Không khởi tạo được Firebase:', e);
}