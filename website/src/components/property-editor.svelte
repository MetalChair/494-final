<script>
    import { current_edit_workout, editor_target} from "./stores"
    import { fade, fly } from 'svelte/transition';
</script>
<style>
    .card{
        transition: all .5s cubic-bezier(0.075, 0.82, 0.165, 1);
    }
</style>  
    {#if 
        $current_edit_workout.activities &&
        $editor_target != null
    }
    <div class="card teal" in:fade out:fade>
        <div class="card-content white-text">
            <span class="card-title">Edit Workout Properties</span>
        </div>
        <div class="card-action white-text">
            {#each Object.entries($current_edit_workout.activities[$editor_target].editable_props) as [key, value]}
                {key.toUpperCase()}
                <input 
                    class = "white-text"
                    bind:value={$current_edit_workout.activities[$editor_target].editable_props[key]}
                >
            {/each}
        </div>
    </div>
{/if}