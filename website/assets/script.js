//Setup routese
page.base('');
page(beforeLoad);
page('/', Home);
page("/workouts", Workouts);
page("/settings", Settings);
page("/live-readout", LiveData)
page();

function beforeLoad(ctx, next){
    clearCSS();
    clearContent();
    clearAllTimeouts();
    next();
}
function clearAllTimeouts(){
    timeouts.forEach(element => {
        clearInterval(element);
    });
}
function clearContent(){
    document.querySelectorAll(".content > *").forEach((node)=>{
        node.classList.add("hidden");
    });
}

function matchRoute(route){
    console.log(route);
    next();
}
//Mount the home route
function Home(){
    addClass("#home-button", "active")
}
function Workouts(){
    addClass("#workouts-button", "active")
}
function Settings(){
    addClass("#settings-button", "active")
}

function LiveData(){
    addClass("#live-reading", "active");
    removeClass("#live-readout-content", "hidden");
    window.timeouts.push(setInterval(updateLiveData, 100));
    onLiveDataMount();
}

function onLiveDataMount(){

}

function updateLiveData(){
    document.querySelector("#big-flex-number").innerHTML = currentFlex;
}






function clearCSS(){
    var modif = document.querySelectorAll(".modified");
    for(var i = 0; i < modif.length; i++){
        var newClasses = [];
        for(var val of modif[i].classList) {
            console.log(val);
            if(val == "modified"){
                break;
            }
            newClasses.push(val);
        }
        console.log(newClasses);
        modif[i].classList = classListToString(newClasses);
    };
}
function classListToString(list){
    let r = "";
    list.forEach((val)=>{
        r += val + " "
    })
    return r;
}

function addClass(query, className){
    var elem = document.querySelector(query)
    elem.classList.add("modified")
    elem.classList.add(className)

}
function removeClass(query, className){
    document.querySelector(query).classList.remove(className);
}