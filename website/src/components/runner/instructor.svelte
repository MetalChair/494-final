<script>
    import states from "./states"
    export let done, state;
    export let return_data;

</script>

<style>
    .instructor-container{
        display: flex;
        width: 100%;
        height: 100%;
        justify-content: center;
        align-items: center;
        flex-direction: column;
    }
</style>
<div class = "instructor-container">
    {#if state === states.INIT}
        <h4>Please put the compression sleeve on your elbow</h4>
    {/if}
    <br>
    <button class ="btn" on:click="{done()}">
        I'm ready to go!
    </button>
</div>
