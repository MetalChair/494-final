<script>
    import states from "./states"
    export let done, state;
    export let return_data;

</script>
{#if state === states.INIT}
    GRAPHIC here<br>
    PUT THE SENSOR ON
{/if}
<br>
<button on:click="{done()}">
    Done
</button>
