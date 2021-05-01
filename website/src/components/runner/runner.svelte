<script>
    import { onMount } from "svelte";
    import { cubicOut, elasticOut } from 'svelte/easing'
    import {current_flex} from "../stores"
    import { fly, fade } from 'svelte/transition'
    export let data = {};
    let resolve, reject;
    let button_promise = new Promise((_resolve, _reject) =>{
        resolve = _resolve
        reject=  _reject
    })

    let activityIDX = 0;
    onMount(()=>{
        //Form a new json object for local storage
        localStorage.setItem("active_workout", JSON.stringify(data))
        data.workout_queue[activityIDX].active = true
        data.workout_queue.push({
            "name":"Workout Finished!",
            "end": true
        })
        data = data
        waitForExercises()
    })
    function resolveExercise(){ 
        resolve()
        console.log("Resolved a workout promise")
        button_promise = new Promise((_resolve, _reject) =>{
            resolve = _resolve
            reject=  _reject
        })
    }
    //Takes a 
    function querySensor(resolve, timout_to_clear, bounds_low, bounds_high){
        if($current_flex > bounds_low && $current_flex < bounds_high){
            clearInterval(timout_to_clear)
            resolve()
        }
    }

    function withinThreshold(low, high){
        return new Promise((resolve, reject) =>{
            const interval = setInterval(()=>{
                    querySensor(
                        resolve, 
                        interval, 
                        low, 
                        high
                    )
            },100)
        })
    }
    function getRep(){
        return new Promise(async (resolve, reject) =>{
            let curr = data.workout_queue[0];
            //The exercise starts from the flexed position
            if(curr.start === "flex"){
                //Wait till we're within our threshold
                await withinThreshold(
                    data.sensor_data.low_flex, 
                    data.sensor_data.high_flex, 
                )
                await withinThreshold(
                    data.sensor_data.low_straight, 
                    data.sensor_data.high_straight,
                )
                resolve()
            }else if(curr.start === "straight"){
                
                await withinThreshold(
                    data.sensor_data.low_straight, 
                    data.sensor_data.high_straight,
                    )
                console.log("Within threshold for straight start")
                await withinThreshold(
                    data.sensor_data.low_flex, 
                    data.sensor_data.high_flex, 
                )
                resolve()
            }
        });
    }
    function waitForFlexAcitivty(){
        return new Promise(async (resolve, reject) =>{
            while(data.workout_queue[0].reps_remaining > 0){
                await getRep()
                data.workout_queue[0].reps_remaining--
            }
            console.log("Done with this exercise")
            resolve()
        }); 
    }
    function sleep(time){
        return new Promise((resolve, reject) => {
            setTimeout(resolve, time);
        })
    }
    async function waitForExercises(){
        while(data.workout_queue.length > 0){
            if(data.workout_queue[0].use_flex === true){
                if(data.workout_queue[0].editable_props.reps != null){
                    data.workout_queue[0].reps_remaining = data.workout_queue[0].editable_props.reps
                }
                await waitForFlexAcitivty();
                console.log("Going to next exercise from completion")
            }else if(data.workout_queue[0].use_flex === false){
                await button_promise;
                console.log("Going to next exercise from button")
            }
            //End card
            else if(data.workout_queue[0].end === true){
                //TODO: Setup history logging
                await sleep(2000)
                page.redirect("/workouts")
            }
            data.workout_queue.shift()
            data.workout_queue = data.workout_queue
            console.log(data.workout_queue)
            await sleep(500)
        }
    }
    function rotateOut(node, {
        delay = 0,
        duration = 250
    }) {

        return {
            delay,
            duration,
            css: t =>{
                const eased = cubicOut(t)
                return `
                opacity: ${eased};
                transform: rotate(${(1 - eased) * -10}deg);
                `
            }
                
        };
    }
    function iterateActivity(){
        console.log([...data.workout_queue])
        data.workout_queue = [...data.workout_queue.slice(1)]
        console.log([...data.workout_queue])
    }

</script>
<style>
    .queue-card{
        width: 55vw;
        height: 70vh;
        margin-right: 5px;
        transition: all .5s;
        transition-delay: .25s;
        position: absolute;
        left: 0;
        right: 0;
        top:0;
        bottom: 0;
        margin: auto;
        border-radius: 5px;
        text-align: center;
        padding: 5px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
    }
    .queue-card-container{
        justify-content: center;
        align-items: center;
        flex-wrap: nowrap;
        height: 100%;
        width: 100%;
        position: relative;
    }
</style>
<br class>
<div out:fade class = "workouts-container queue-card-container">
    {#each data.workout_queue as item, i (item.key)}
        <div
            class = "card queue-card" 
            style = "
                z-index: {-i};
                transform: matrix({(1 - (i * .05))}, 0, 0, 1, 1, {-i * 5});
            "
            out:rotateOut
            in:fly="{{duration: 1000,delay: 10 * i, easing: elasticOut, y: 100}}"
             >
            <h4><b>{item.name}</b></h4><br>
            {#if item.reps_remaining }
                <h3><b>{item.reps_remaining} left!</b></h3>
            {/if}
            {#if item.image }
                <img alt = "BicepCurlGif" src = {item.image}>
            {/if}
            <div>
                {#if item.desc}
                    {item.desc}
                {/if}
            </div>
            {#if item.display_props}
                {#each Object.entries(item.display_props) as [key, value]}
                    <div>
                        {value} {item.editable_props[key]}
                    </div>
                {/each}
            {/if}
            {#if item.use_flex === false && i == 0}
                <button class = "btn" on:click="{resolveExercise}">Done!</button>
            {/if}
        </div>
    {/each}
</div>