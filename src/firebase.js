import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyAYQWM2eoql01R_mr47AolMqrLEJI4YRHs",
  authDomain: "talkus-system.firebaseapp.com",
  projectId: "talkus-system",
  storageBucket: "talkus-system.firebasestorage.app",
  messagingSenderId: "166059304904",
  appId: "1:166059304904:web:c2fa071fec62653dac42fd"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
