<script>
    import {current_edit_workout, editor_target } from "./stores"
    import exercises from "../assets/exercises"
    import PropertyEditor from "./property-editor.svelte";
    import { beforeUpdate, onDestroy, onMount } from "svelte";
import { readable, writable } from "svelte/store";
    export let ctx;
    export let id;
    let sub;
    beforeUpdate(()=>{
        id = ctx.id;
        let curr = JSON.parse(localStorage.getItem("routine_list"));
        let workout_obj = JSON.parse(curr[id])
        current_edit_workout.set(workout_obj)
        sub = current_edit_workout.subscribe(value =>{
            let curr = JSON.parse(localStorage.getItem("routine_list"))
            curr[id] = JSON.stringify($current_edit_workout)
            localStorage.setItem("routine_list", JSON.stringify(curr))
        })
    })

    onDestroy(()=>{
        if(sub)
            sub();
        $editor_target = null;
        if($current_edit_workout.activities.length === 0 &&
           $current_edit_workout.name === "My Cool Workout"
        ){
            let curr = JSON.parse(localStorage.getItem("routine_list"));
            delete curr[id]
            localStorage.setItem("routine_list", JSON.stringify(curr));
        }
    })


    function addExercise(e, ex){
        current_edit_workout.update(curr =>{
            ex.key = Math.random()
            let ret
            ret = curr
            ret["activities"].push(_.cloneDeep(ex))
            return ret
        })
    }
    function doDrag(e, entry, idx){
        e.preventDefault()

        var dragX = e.pageX, dragY = e.pageY;
        e.target.style.top = dragY + "px";
    }
    function startDrag(e, entry, idx){
        clearEditor();
        $current_edit_workout.activities[idx].beingDragged = true
        //Set the origin index for the transfer
        e.dataTransfer.setData("source", idx)
    }
    function endDrag(e, entry, idx){
        e.preventDefault()
        $current_edit_workout.activities[idx].beingDragged = null
    }
    function onDrop(e, entry, idx){
        let src =  e.dataTransfer.getData("source");
        let temp = $current_edit_workout.activities[idx]
        $current_edit_workout.activities[idx] = $current_edit_workout.activities[src];
        $current_edit_workout.activities[src] = temp;
    }
    function editItemAtIDX(idx){
        clearEditor();
        $current_edit_workout.activities[idx].beingEdited = true;
        editor_target.set(idx);
    }
    function clearEditor(){
        if($editor_target != null)
            $current_edit_workout.activities[$editor_target].beingEdited = false;
    }

</script>
<style>
    .create-workout-container{
        display: flex;
        flex-direction: column;
        margin-right: 10%;
    }
    .workout-creator-cols{
        display: flex;
        height: 100%;
        flex-direction: row;
    }
    /*Give columns equal width */
    .workout-creator-cols > *{
        flex: 1;
        display: flex;
        flex-direction: column;
        margin: 1em;
    }
    .workout-creator-col > .col-header{
        margin-bottom: 20px;
    }
    .exercise-listing{
        transition: all .5s;
        cursor: move;
    }
    .exercise-listing:hover{
        background-color: #ddd;
    }
    .drag-container{
        top: 0;
        widows: 100%;
        display: flex;
        flex-direction: column;
    }
    .being-dragged{
        background-color: #ddd !important;
        position: relative;
    }

    .title-save-container{
        display: flex;
        flex-direction: row;
        justify-content: space-between;
    }
    .title-save-container > *{
        margin-right: 1em;
    }

</style>
<div class = "workouts-container">
    <h4><b>Edit A Routine:</b></h4>
    <div class = "create-workout-container">
        <div class="input-field col s6">
            <h6><b>Name:</b></h6>
            <div class = "title-save-container">
                <input 
                 bind:value= {$current_edit_workout.name}
                 id="name" 
                 type="text" 
                 class="input-field inline">
            </div>
        </div>
        <div class = "workout-creator-cols">
            <div class = "workout-creator-col">
                <div class = "col-header">
                    <b>Available Exercises:</b>
                </div>
                <ul class="collection">
                    {#each [...exercises] as [key, value]}
                        <li 
                            class = "collection-item exercise-listing" 
                            on:click="{e => addExercise(e, value)}"
                        >
                            {value.name}
                        </li>
                    {/each}
                </ul>
            </div>
            <div class=  "workout-creator-col">
                <div class = "col-header">
                    <b>Your Workout:</b>
                </div>
                <ul class="collection drag-container">
                    {#if !$current_edit_workout["activities"] ||
                        $current_edit_workout["activities"].length === 0
                    }
                        <div class = "collection-item teal white-text">
                            Exercises you add will appear here!
                        </div>
                    {:else}
                        {#each $current_edit_workout["activities"]as excs, i (excs.key)}
                                 <li 
                                    class = "collection-item exercise-listing"
                                    draggable = "true"
                                    on:dragstart="{e =>
                                        startDrag(e, excs, i)
                                    }"
                                    on:dragend="{e =>
                                        endDrag(e, excs, i)
                                    }"
                                    on:dragover="{e =>
                                        doDrag(e, excs, i)
                                    }"
                                    on:drop="{e =>
                                        onDrop(e, excs, i)
                                    }"
                                    on:click="{e =>
                                        editItemAtIDX(i)
                                    }"
                                    class:being-dragged="{excs.beingDragged === true}"
                                    class:teal ="{excs.beingEdited === true}"
                                    class:white-text ="{excs.beingEdited === true}"
                                >   
                                    {excs.name}
                                    {#if excs.editable_props.reps != null}
                                        x {excs.editable_props.reps}
                                    {/if}
                                    {#if excs.editable_props.weight != null}
                                        ({excs.editable_props.weight} lbs.)
                                    {/if}
                                </li>
                        {/each}
                    {/if}
                </ul>
            </div>
        </div>
    </div>
        <PropertyEditor>
        </PropertyEditor>
</div>
