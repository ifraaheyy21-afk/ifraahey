import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
    apiKey: "AIzaSyDIRewdvcQ_tiizJ_aHuy4o_GKyY_zXUX0",
    authDomain: "mailgine.firebaseapp.com",
    projectId: "mailgine",
    storageBucket: "mailgine.firebasestorage.app",
    messagingSenderId: "932762387162",
    appId: "1:932762387162:web:3283b35b907cd4b60d5be3",
    measurementId: "G-YEY5D3NMMT"
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);

export default app;