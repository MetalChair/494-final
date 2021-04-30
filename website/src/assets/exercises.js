let exercises = new Map();
let data_arr = [
    {
        "name" : "Bicep Curls",
        "desc" : "Add an interesting description",
        "id" : 0,
        "editable_props" : {
                "reps" : 10,
                "weight" : 25
        }
    },
    {
        "name" : "Shoulder Press",
        "desc" : "Add an interesting description",
        "id" : 1,
        "editable_props" : {
            "reps" : 10,
            "weight" : 25

        }
    }
]

data_arr.forEach(element =>{
    exercises.set(element.id, element);
})

export default exercises;