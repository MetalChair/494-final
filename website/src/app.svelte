<script>
    import { writable } from "svelte/store";
    import Router from "./router.svelte"
    export let current_route = writable({}); //Maintained in global scope 
    export let current_flex = writable(0);
    let socket = new WebSocket("ws://localhost:3000");
    socket.onmessage = (event) =>{
        current_flex = event.data;
    }
</script>
<body>
    <div class = "content-container">
        <div class = "sidebar z-depth-1">
           <Router bind:current_route={current_route}></Router>
        </div>
        <div class = "content grey lighten-5">
            {#if current_route != undefined}
                <svelte:component 
                    this = {$current_route.component}
                    current_flex = {$current_flex}
                >
                </svelte:component>
            {/if}
        </div>
    </div>
</body>