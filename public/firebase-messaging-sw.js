importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyDazYLIHI4kpcwHwLORXgb8UXtAeJAmO1Y',
  authDomain: 'dezartwash.firebaseapp.com',
  projectId: 'dezartwash',
  storageBucket: 'dezartwash.firebasestorage.app',
  messagingSenderId: '977338397705',
  appId: '1:977338397705:web:63d275c3256341ab9574d8',
});

// FCM shows the notification itself for messages that carry a "notification".
firebase.messaging();
