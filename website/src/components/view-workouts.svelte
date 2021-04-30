<script>
import { each } from "svelte/internal";


    let workouts;
    try{
        workouts = JSON.parse(localStorage.getItem("routine_list"))
    }catch(e){
        console.log(e);
        workouts = null;
    }
</script>

<style>
    .workout-viewer{
        display:flex;
        flex-wrap: wrap;
    }
    .workout-viewer > a{
        margin: 5px;
        text-decoration: none;
        color: initial;
        text-align: center;
    }
    .workout-viewer > a > div{
        display: flex;
        flex-direction: column;
        min-height: 22vw;
        max-height: 22vw;
        min-width: 22vw;
        max-width: 22vw;
        text-align: center;
        padding: 2.5%;
    }
    .workout-card{
        transition: box-shadow .2s cubic-bezier(0.165, 0.84, 0.44, 1);
    }
    .workout-card:hover{
        -webkit-box-shadow: 0 4px 5px 0 rgba(0,0,0,0.14),0 1px 10px 0 rgba(0,0,0,0.12),0 2px 4px -1px rgba(0,0,0,0.3);
        box-shadow: 0 4px 5px 0 rgba(0,0,0,0.14),0 1px 10px 0 rgba(0,0,0,0.12),0 2px 4px -1px rgba(0,0,0,0.3);
    }
</style>

<div class = "workouts-container">
    <h4><b>Your Routines</b></h4><br>
    {#if workouts != null}
    <div class = "workout-viewer row">
        {#each Object.entries(workouts).map(x=> [x[0],JSON.parse(x[1])]) as [key,content]}
                <a class = "workout-card z-depth-1" href = "/create-workout/{key}">
                    <div >
                        <b>{content.name}</b>
                        <span>Performed {content.times_performed} time(s)</span>
                        <ul class = "collection">
                        {#each {length: Math.min(content.activities.length, 3)} as _, i}
                                <li class = "collection-item">
                                    {content.activities[i].name}
                                </li>
                        {/each}
                        {#if content.activities.length > 3}
                                <li class = "collection-item teal white-text">
                                    ...And More!
                                </li>
                        {/if}
                        </ul>
                        <a href="./run-workout/{key}" class = "button">Start</a>
                    </div>
                </a>
                {/each}
    </div>
    {/if}
</div>