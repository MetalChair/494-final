<script>
    import RouterItem from "./router-item.svelte"
    import LiveRead from "./components/live-readout.svelte"
    import Workouts from "./components/workouts.svelte"

    //Define new routes here
    const routes = [
        {
            "path" : "/",
            "label" : "Home",
            "icon" : "home",
            "component": LiveRead
        },
        {
            "path" : "/workouts",
            "label" : "Workouts",
            "icon" : "fitness_center",
            "component": Workouts
        },
        {
            "path" : "/settings",
            "label" : "Settings",
            "icon" : "settings",
            "component": LiveRead
        },
        {
            "path" : "/live-readout",
            "label" : "Live Readout",
            "icon" : "whatshot",
            "component": LiveRead
        },
    ]
    export let current_route = routes[0];
    page.base('')
    routes.forEach(element => {
        page(element.path, ()=>{
            $current_route = element;
        });
    });
    page()
</script>
<div class = "brand teal lighten-1 white-text">
    <b>Wearable Fitness Tracker</b>
</div>
<ul class = "collection">
    {#each routes as route}
        <RouterItem 
            active = {route.path == $current_route.path}
            path = {route.path} 
            label = {route.label}
            icon = {route.icon}
        >
        </RouterItem>
    {/each}
</ul>