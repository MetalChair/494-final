<script>
    import RouterItem from "./router-item.svelte"
    import LiveRead from "./components/live-readout.svelte"
    import Workouts from "./components/workouts.svelte"
    import CreateWorkout from "./components/create-workout.svelte";
    import ViewWorkouts from "./components/view-workouts.svelte";
    import {v4 as uuidv4} from 'uuid'
    import WorkoutRunner from "./components/workout-runner.svelte";
    import workout_template from "./components/workout-template";

    //Define new routes here
    const routes = [
        {
            "path" : "/",
            "label" : "Home",
            "icon" : "home",
            "component": LiveRead,
            "show": true

        },
        {
            "path" : "/workouts",
            "label" : "Workout History",
            "icon" : "fitness_center",
            "component": Workouts,
            "show": true

        },
        {
            "path" : "/settings",
            "label" : "Settings",
            "icon" : "settings",
            "component": LiveRead,
            "show": true

        },
        {
            "path" : "/live-readout",
            "label" : "Live Readout",
            "icon" : "whatshot",
            "component": LiveRead,
            "show": true

        },
  
        {
            "path" : "/create-workout",
            "label" : "Create a Routine",
            "icon" : "add",
            "component": CreateWorkout,
            "middlewares": [createWorkout],
            "show": true

        },
        {
            "path" : "/create-workout/:id",
            "component": CreateWorkout,
            "show": false
        },
        {
            "path" : "/run-workout/:id",
            "component": WorkoutRunner,
            "show" : false
        },
        {
            "path" : "/view-routines",
            "label" : "View/Start Routines",
            "icon" : "view_headline",
            'component': ViewWorkouts,
            "show": true
        }
    ]

    function createWorkout(ctx, next){
        localStorage.clear("active_workout")
        let id = uuidv4();
        ctx.id = id;
        let curr = JSON.parse(localStorage.getItem("routine_list"));
        if(!curr){
            curr = {}
        }
        curr[id] = JSON.stringify(workout_template);
        localStorage.setItem("routine_list", JSON.stringify(curr))
        page.redirect("/create-workout/" + id)
    }

    
    //Defines middlewares that are not meant to show up in navbar
    export let current_route = routes[0];
    export let route_ctx = {};
    page.base('')
    routes.forEach(element => {
        if(element.middlewares){
            page(element.path, ...element.middlewares, (ctx, next)=>{
                $current_route = element;
                $route_ctx = ctx.params;
            });
        }else{
            page(element.path, (ctx)=>{
                $current_route = element;
                $route_ctx = ctx.params;
            });
        }
    });
    page()
</script>
<div class = "brand teal lighten-1 white-text">
    <b>Wearable Fitness Tracker</b>
</div>
<ul class = "collection">
    {#each routes as route}
    {#if route.show != false}
        <RouterItem 
            active = {route.path == $current_route.path}
            path = {route.path} 
            label = {route.label}
            icon = {route.icon}
        >
        </RouterItem>
        {/if}
    {/each}
</ul>