<script>
import { onMount } from "svelte";
import { writable } from "svelte/store";
import Calibrate from "./runner/calibrate.svelte";
import Instructor from "./runner/instructor.svelte";
import Runner from "./runner/runner.svelte";
import states from "./runner/states"    
    export let ctx;

    //The current state of this workout-runner
    let current_state = writable(states.INIT);
    
    //The current rendered component
    let current_component = writable()

    //Data sent into each component
    let component_data = writable({})

    //Data returned from each component when they call finishState()
    export let return_data = writable();
    //Get the workout by ID and load it into active workout
    onMount(()=>{
        //First check if we have an active workout
        //This allows us to persist workouts throughout refreshes
        let curr = JSON.parse(localStorage.getItem("active_workout"))
        if(curr != null){
            $component_data.active_workout = curr.active_workout
            $component_data.workout_queue = [...curr.workout_queue]
            $component_data.sensor_data = curr.sensor_data
            $component_data.id = curr.id;
        }
        if($component_data.id != ctx.id){
            curr = JSON.parse(localStorage.getItem("routine_list"));
            console.log("Starting new workout at ID:", ctx.id)
            let workout = JSON.parse(curr[ctx.id])
            $component_data.active_workout = workout;
            $component_data.workout_queue = workout.activities;
            $component_data.id = ctx.id;
    
            //Update the current workout to indicate we've performed it
            $component_data.active_workout.times_performed++
            curr[ctx.id] = JSON.stringify($component_data.active_workout)
            localStorage.setItem("routine_list", JSON.stringify(curr))
        }else{
            $current_state = states.RUNNING
            $current_component = Runner
        }

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
        console.log("Returned state:", $return_data)
        switch($current_state){
            case(states.INIT):
                $current_state = states.CALIBRATING
                $current_component = Calibrate
                break;
            case(states.CALIBRATING):
                $component_data.sensor_data = $return_data
                $current_state = states.RUNNING
                $current_component = Runner
                break;
        }
        return_data = new writable();
    }
</script>
<div>
    <svelte:component 
        this = {$current_component}
        done = {finishState}
        state = {$current_state}
        bind:data = {$component_data}
        bind:return_data = {$return_data}
    >
    </svelte:component>
</div>
