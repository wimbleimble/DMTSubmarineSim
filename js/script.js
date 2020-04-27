/*---------------------------engine variables---------------------------*/
const canvas = document.getElementById("3DViewport");
let loader = new THREE.GLTFLoader();
let scene = new THREE.Scene();
let renderer = new THREE.WebGLRenderer({
	antialias: true,
	canvas: canvas
});
let deltaTime = 0;
let previousTime = 0;

/*-----------------------------ui elements------------------------------*/

let surfaceButton = document.getElementById("emergencySurface");
let fpsDisplay = document.getElementById("frameCounter");
let forceDisplay = document.getElementById("forceDisplay");
let accelerationDisplay = document.getElementById("accelerationDisplay");
let velocityDisplay = document.getElementById("velocityDisplay");


/* let mousePosition = new THREE.Vector2();
let previousMousePosition = new THREE.Vector2();
let mouseVelocity = new THREE.Vector2();
let mouseDown = false; */

/*-------------------------numerical constants--------------------------*/
const g = 9.81;
const risingForce = 0.1;

/*-------------------------------classes--------------------------------*/
class Submarine
{
	constructor(mass)
	{
		this.resultantForce = new THREE.Vector3(0, 0, 0);
		this.mass = 50;
		this.maxVelocity;
		this.model;
		this.depth;
		this._velocity = new THREE.Vector3(0, 0, 0);
	}
	get acceleration()
	{
		return new THREE.Vector3(this.resultantForce.x, this.resultantForce.y, this.resultantForce.z).divideScalar(this.mass);
	}
	get velocity()
	{
		//console.log(this.acceleration);
		return this._velocity.add(this.acceleration);
	}
	
	move()
	{
		//move
		this.model.position.add(this.velocity);
		//camera.position.add(this.velocity);
	}
}

/*----------------------------scene variables---------------------------*/

//lighting
let light = new THREE.PointLight(0xffffff, 1, 0);
let ambientLight = new THREE.AmbientLight(0x404040);
scene.add(light);
scene.add(ambientLight);
light.position.y = 5;

//camera
let camera = new THREE.PerspectiveCamera(90, window.innerWidth/window.innerHeight	, 0.1, 1000);

//camera controls
let cameraController = new THREE.OrbitControls(camera, canvas);
cameraController.enableKeys = false;

//inital camera position
camera.position.set(14, 14, 5);
cameraController.update();

//grid and origin axes
let grid = new THREE.GridHelper(1000, 100, 0xcc0e74, 0xcc0e74);
scene.add(grid);
let axes = new THREE.AxesHelper(5);
scene.add(axes);

//submarine
let submarine = new Submarine();
loader.load("SubWAY.glb", (gltf) =>
{
	submarine.model = gltf.scene.children[0];
	submarine.model.material = new THREE.MeshPhongMaterial({ color: 0xa3f7bf });;
	scene.add(submarine.model);
	updateDimensions();
	mainLoop(0);
});

function updateDimensions()
{
	canvas.width = window.innerWidth;
	canvas.height = window.innerHeight;
	camera.aspect = window.innerWidth/window.innerHeight;
	camera.updateProjectionMatrix();
	renderer.setSize(window.innerWidth, window.innerHeight);	
}

function updateDisplays()
{
	forceDisplay.innerHTML = "F: " + submarine.resultantForce.x + " " + submarine.resultantForce.y + " " + submarine.resultantForce.z;
	accelerationDisplay.innerHTML = "A: " + submarine.acceleration.x + " " + submarine.acceleration.y + " " + submarine.acceleration.z;
	velocityDisplay.innerHTML = "V: " + submarine.velocity.x + " " + submarine.velocity.y + " " + submarine.velocity.z;
	fpsDisplay.innerHTML = Math.round(1000 / deltaTime);
}

/* function updateMouseVelocity()
{
	let tempPos = mousePosition.clone();
	if(deltaTime != 0)
	{
		mouseVelocity = tempPos.sub(previousMousePosition).divideScalar(deltaTime);
	}
}

function updatePreviousMousePosition()
{
	previousMousePosition = mousePosition.clone();
}
 */

function positionCamera()
{
	camera.position.add(submarine.velocity);
	cameraController.target.add(submarine.velocity);
	cameraController.update();
}

function mainLoop(currentTime)
{
	deltaTime = currentTime - previousTime;
	previousTime = currentTime;
	submarine.move();
	updateDisplays();
	/* updateMouseVelocity(); */
	positionCamera();
	renderer.render(scene, camera);
	/* updatePreviousMousePosition(); */
	requestAnimationFrame(mainLoop);
}


/*------------------------------events-----------------------------*/

surfaceButton.addEventListener("onclick", () =>
{
	console.log("Surfacing!");
});

document.addEventListener("keydown", e =>
{
	switch(e.keyCode)
	{
		case 38:
			submarine.resultantForce.y = risingForce;
			break;
		case 40:
			submarine.resultantForce.y = -risingForce;
			break
	}
});

document.addEventListener("keyup", e =>
{
	switch(e.keyCode)
	{
		case 38:
		case 40:
			submarine.resultantForce.y = 0;
			break;
	}
});
window.addEventListener("resize", () =>
{
	console.log("Pleep");
	updateDimensions();
});

/* document.addEventListener("mousemove", e =>
{
	mousePosition.x = e.clientX;
	mousePosition.y = e.clientY;
});
canvas.addEventListener("mousedown", () =>
{
	mouseDown = true;
});
document.addEventListener("mouseup", () =>
{
	mouseDown = false;
}); */