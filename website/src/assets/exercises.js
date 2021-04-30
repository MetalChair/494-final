let exercises = new Map();
let data_arr = [
    {
        "location": "elbow",
        "name" : "Bicep Curls",
        "desc" : "Add an interesting description",
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
        "desc" : "Add an interesting description",
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
        "desc" : "Add an interesting description",
        "id" : 2,
        "editable_props" : {
            "time" : 10,
            "distance" : 1
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