import firebase_admin
from firebase_admin import credentials, db

def initialize_firebase():
    # Menggunakan kunci rahasia JSON
    cred = credentials.Certificate("serviceAccountKey.json")
    
    firebase_admin.initialize_app(cred, {
        # GANTI DENGAN URL DATABASE ANDA (pastikan ada '/' di akhir)
        'databaseURL': 'https://mobile-embeded-system-default-rtdb.asia-southeast1.firebasedatabase.app/'
    })
    
    print("[INFO] Berhasil terhubung ke Firebase Realtime Database!")
    return db

