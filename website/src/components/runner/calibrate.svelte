<script>
import { onDestroy, onMount } from "svelte";
import {current_flex, sensor_data } from "../stores"
    export let return_data;
    export let done;
    let sub;
    let calib_data;
    const CALIBRATE_STATES = {
        "STRAIGHT": 0,
        "WAITING_FOR_FLEX": 1,
        "FLEXED": 2,
        "DONE": 3
    }
    let current_state = CALIBRATE_STATES.STRAIGHT;
    onMount(async ()=>{
        calib_data = {};
        return_data = {};
        calib_data.is_calibrating = true
        calib_data.average = 0
        calib_data.count = 0
        calib_data.last_val = 0
        calib_data.time_calibrated = 0
        sub = current_flex.subscribe(val =>{
            if(calib_data.is_calibrating){
                calib_data.last_val = val
                calib_data.count++
                calib_data.average = 
                    calib_data.average + ((val - calib_data.average) / calib_data.count)
                }
        })
        return_data.straight_calib = await CalibrateSensor()
        console.log("Calibrated stragiht reading at", return_data.straight_calib)

        //Wait until the user flexes the sensor
        current_state = CALIBRATE_STATES.WAITING_FOR_FLEX
        calib_data.count = 0
        calib_data.average = 0
        await waitForFlex()
        console.log("Done checking for flex")

        //Calibrate the flexed state
        current_state = CALIBRATE_STATES.FLEXED
        calib_data.count = 0
        calib_data.average = 0
        return_data.flex_calib = await CalibrateSensor()
        console.log("Done calibrating flex at", return_data.flex_calib);

        //Notify the user they're done and calculate the ranges
        current_state = CALIBRATE_STATES.DONE
        //Low and high are 15% away from actual calib data,
        return_data.low_straight = return_data.straight_calib - (return_data.straight_calib * .15)
        return_data.high_straight = return_data.straight_calib + (return_data.straight_calib * .15)
        return_data.low_flex = return_data.flex_calib - (return_data.flex_calib * .15)
        return_data.high_flex = return_data.flex_calib + (return_data.flex_calib * .15)
        setTimeout(done, 2000)
    })
    onDestroy(()=>{
        sub()
    })

    
    function CalibrateSensor(){
        return new Promise((resolve, reject) =>{
            
            setTimeout(()=>{
                resolve(calib_data.average)
            }, 4000)
        })
    }
    function checkFlex(resolve, interval){
        if(
            Math.abs((return_data.straight_calib - calib_data.last_val)) > 15
        ){
            clearInterval(interval)
            resolve()
        }
    }
    function waitForFlex(){
        return new Promise((resolve, reject)=>{
            const interval = setInterval(()=>{
                checkFlex(resolve, interval)
            }, 500);
            setTimeout(()=>{
                clearInterval(interval)
                reject()
            }, 10000)
        })
    }

</script>
<style>
    .status-container{
        display: flex;
        width: 100%;
        height: 100%;
        justify-content: center;
        align-items: center;
        flex-direction: column;
    }
</style>
<div class = "status-container">
    {#if current_state === CALIBRATE_STATES.STRAIGHT}
        <h4>Calibrating Sensor... Hold Arm Straight </h4>
    {:else if current_state === CALIBRATE_STATES.WAITING_FOR_FLEX}
        <h4>Now flex the sensor </h4>
    {:else if current_state === CALIBRATE_STATES.FLEXED}
        <h4>Hold that position</h4>
    {:else if current_state === CALIBRATE_STATES.DONE}
        <div><h4>All Done</h4></div>
        <div><h4>Starting your workout</h4></div>
    {/if}
</div>

