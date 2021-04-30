<script>
    import states from "./states"
    export let done, state;
</script>
{#if state === states.INIT}
    GRAPHIC here<br>
    PUT THE SENSOR ON
{/if}
<br>
<button on:click="{done()}">
    Done
</button>
