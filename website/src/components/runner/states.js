//States that the workout runner can currently be in
const states = {
    CALIBRATING: 0, //Calibrating the sensor
    0: "CALIBRATING", 
    RUNNING: 1, //Activity is currently running
    1: "RUNNING",
    PAUSED: 2, //Workout paused
    2: "PAUSED",
    SWITCHING: 3, //Move the flex sensor from x to y
    3: "SWITCHING",
    INIT: 4, //Put the flex sensor on your arm/wrist/leg/body
    4: "INIT"
}
export default states