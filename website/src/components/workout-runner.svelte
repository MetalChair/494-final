<script>
import { onMount } from "svelte";
import { action_destroyer, claim_text } from "svelte/internal";

import { writable } from "svelte/store";
import Calibrate from "./runner/calibrate.svelte";
import Instructor from "./runner/instructor.svelte";
import states from "./runner/states"    
    export let ctx;

    let current_state = writable(states.INIT);
    let current_component = writable()
    //Active workout is the entire object
    let active_workout = writable()
    //Workout queue is just a queue of the activties we need to do
    let workout_queue = writable()
    //Get the workout by ID and load it into active workout
    onMount(()=>{
        let curr = JSON.parse(localStorage.getItem("routine_list"));
        console.log("Starting new workout at ID:", ctx.id)
        let workout = JSON.parse(curr[ctx.id])
        $active_workout = workout;
        $workout_queue = workout.activities;
    });
    switch($current_state){
        case states.SWITCHING:
            $current_component = Instructor
            break
        case states.CALIBRATING:
            $current_component = Calibrate
            break
        case states.INIT:
            $current_component = Instructor
    }

    //Called by a state component when it has finished doing its thing
    function finishState(){
        console.log("Finished step:", states[$current_state]);
        switch($current_state){
            case(states.INIT):
                $current_state = states.CALIBRATING
                $current_component = Calibrate
                break;
        }
    }
</script>
<div>
    <svelte:component 
        this = {$current_component}
        done = {finishState}
        state = {$current_state}
    >
    </svelte:component>
</div>
