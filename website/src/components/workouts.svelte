<script>
import { onMount } from "svelte";

    import { writable } from "svelte/store";
    export const workout_history = writable([{}])
    onMount(() =>{
        let data = JSON.parse(localStorage.getItem("workout_history"))
        console.log(data)
        workout_history.set(data)
    });

    export let show_more = 1;
</script>
{#if workout_history === null}
    <div class = "readout-container">
        <h3>
            <b>No workouts found. Get to work! 💪</b>
        </h3>
    </div>
{:else}
    <div class="workouts-container">
        <h4><b>Your Workouts</b></h4>
        <div class = "workouts-card-container">
            <div class = "row">
                {#if !$workout_history.error}

                    {#each 
                        {length: Math.min($workout_history.length, 10 * show_more)} as _,i
                    }
                    <div class="col s3 m6">
                        <div class="card teal lighten-4">
                            <div class="card-content">
                                <span class="card-title">{$workout_history[i].name}</span>
                                <p>I am a very simple card. I am good at containing small bits of information.
                                I am convenient because I require little markup to use effectively.</p>
                            </div>
                        </div>
                    </div>
                    {/each}
                    <div class = "row center-align">
                        {#if show_more * 10 }
                            <button 
                                class=" btn waves-effect waves-light" 
                                on:click="{()=>{ show_more = show_more + 1}}"
                            >
                            Load More
                            </button>
                        {/if}
                    </div>
                {/if}
            </div>
        </div>
    </div>
{/if}