/* How to use a flex sensor/resistro - Arduino Tutorial
   Fade an LED with a flex sensor
   More info: http://www.ardumotive.com/how-to-use-a-flex-sensor-en.html
   Dev: Michalis Vasilakis // Date: 9/7/2015 // www.ardumotive.com  */
   const int flexPin = A0; //pin A0 to read analog input

//Variables:
int value; //save analog value


void setup(){  
  Serial.begin(115200);
}

void loop(){
  
  value = analogRead(flexPin);         //Read and save analog value from potentiometer
  Serial.println(value);               //Print value
  delay(100);//Small delay
}
