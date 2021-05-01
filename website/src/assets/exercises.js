let exercises = new Map();
let data_arr = [
    {
        "location": "elbow",
        "name" : "Bicep Curls",
        "image" : "/static/bicep-curl.gif",
        "desc" : "Bend at the elbow until the weight is close to your chest. Return to start",
        "id" : 0,
        "editable_props" : {
                "reps" : 10,
                "weight" : 25
        },
        "use_flex": true,
        "start": "straight",
        "end"  : "flex"
    },
    {
        "location": "elbow",
        "name" : "Shoulder Press",
        "image": "/static/shoulder-press.gif",
        "desc" : "Extend weight over your head, return to start",
        "id" : 1,
        "editable_props" : {
            "reps" : 10,
            "weight" : 25

        },
        "use_flex": true,
        "start": "flex",
        "end"  : "straight"
    },{
        "location": "body",
        "name" : "Run",
        "desc" : "Get that blood pumping with a quick run",
        "id" : 2,
        "editable_props" : {
            "time" : 10,
            "distance" : 1
        },
        "display_props" :{
            "time" : "Time:",
            "distance" : "Distance:"
        },
        "use_flex": false,
        "start": "flex",
        "end"  : "straight"
    }
]

data_arr.forEach(element =>{
    exercises.set(element.id, element);
})

export default exercises;