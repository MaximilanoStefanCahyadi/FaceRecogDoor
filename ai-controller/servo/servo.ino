#include <Servo.h>

Servo pintuServo;
const int pinServo = 9;

void setup() {
  // Memulai komunikasi Serial dengan baud rate 9600
  Serial.begin(9600);
  
  // Inisialisasi Servo
  pintuServo.attach(pinServo);
  
  // Posisikan servo pada 0 derajat (Pintu Terkunci) saat pertama kali menyala
  pintuServo.write(0); 
  
  Serial.println("Arduino Mega Siap. Menunggu perintah dari Python...");
}

void loop() {
  // Mengecek apakah ada data yang masuk dari kabel USB (dari Python)
  if (Serial.available() > 0) {
    char perintah = Serial.read(); // Membaca 1 karakter yang masuk

    // Jika Python mengirim huruf 'O' (Open)
    if (perintah == 'O' || perintah == 'o') {
      Serial.println("Perintah diterima: MEMBUKA PINTU");
      
      pintuServo.write(90); // Putar servo ke 90 derajat (Pintu Terbuka)
      delay(5000);          // Tahan pintu terbuka selama 5 detik
      
      pintuServo.write(0);  // Putar kembali ke 0 derajat (Pintu Terkunci)
      Serial.println("PINTU TERKUNCI KEMBALI");
    }
  }
}