/*-----------------------------SUBSIM.JS--------------------------------
													By William Thomas :-)
	A basic simulator for a model submarine, impelmented in HTML5 using 
	Three.js, a webGL interface.

Notes:
	1.	All values are in base si units, unless otherwise stated. All
		angles are in degrees.
	2.	All variables are notated with the following format:
		//[description], [type]
	3.	All functions are notated with the following format:
		//[description], [return type]
	4.	This code WILL NOT run correctly if not hosted on a server, e.g
		by opening the html file in a browser from disk. The THREE.js
		content loaders use XMLHttpRequest to retrieve content, which
		will tries to request files from the host.

--------------------------------------------------------------CONTENTS--
LINE												SECTION
  25												imports
  32										   physical constants
  36										   submarine classes
 412									     variable declarations
 513											   functions
 771											 event handlers
 812											  entry point
-----------------------------------------------------------------------*/

/*---------------------------importing modules-------------------------*/
import * as THREE from "/node_modules/three/build/three.module.js";
import {GLTFLoader} from "/node_modules/three/examples/jsm/loaders/GLTFLoader.js";
import {OrbitControls} from "/node_modules/three/examples/jsm/controls/OrbitControls.js";
import {Water} from "/node_modules/three/examples/jsm/objects/Water2.js";
import {Sky} from "/node_modules/three/examples/jsm/objects/Sky.js";

/*--------------------------physical constants--------------------------*/
const g = new THREE.Vector3(0, -9.81, 0);
const waterDensity = 997;

/*------------------------submarine classes----------------------------*/
class Ballast
{
	constructor(emptyMass, maxVolume)
	{
		this.emptyMass = emptyMass;	//mass of ballast when empty
		this.maxVolume = maxVolume;	//total volume of ballast available to fill
		this.proportionFull = 0;	//between 0 and 1, proportion of volume full of water.
		this.flowRate = flowRate; 	//speed at which water can flow in and out of ballast
	}

	//calculates volume of water in ballast
	get waterVolume()
	{
		return this.maxVolume * this.proportionFull;
	}

	//calculates total mass of ballast
	get mass()
	{
		return this.emptyMass +  this.waterVolume * waterDensity;
	}

	//calculates weight of ballast
	get weight()
	{
		return g.clone().multiplyScalar(this.mass);
	}

	//adds water given specified volume, ensuring capcity is not exceeded
	addWater(volume)
	{
		let newWater = this.waterVolume + volume;
		let newProportion = clamp(newWater / this.maxVolume, 0, 1);
		this.proportionFull = newProportion
	}

	//subrtacts water given volume
	subWater(volume)
	{
		this.addWater(-volume);
		
	}
}

class Submarine
{
	constructor(entity, mass, length, width, height, dragCoefficient, crossSectArea, ballasts, ballastLocations, ascentSpeed, descentSpeed, emergencySfaceSpeed)
	{
		this.entity = entity;								//submarine three.js object, Object3D
		this.mass = mass;									//mass of submarine without ballasts, not full assembly, Number
		this.length = length								//length of submarine, Number
		this.width = width;									//width of submarine, Number
		this.height = height;								//height of submarine, Number
		this.dragCoefficient = dragCoefficient;				//drag experienced when travelling in each direction, Vector3
		this.crossSectArea = crossSectArea;					//cross sectional area affecting drag in each direction, Vector3
		this.ballasts = ballasts;							//array containing both ballasts, Array(Ballasts)
		this.ballastLocations = ballastLocations;			//location of ballast relative to front, Array(Number)

		this.ascentSpeed = ascentSpeed;						//target speed for auto ascend, Number
		this.descentSpeed = descentSpeed;					//target speed for auto descend, Number
		this.emergencySurfaceSpeed = emergencySfaceSpeed;	//target speed for emergency surface, Number
		this.oldVelocity = new THREE.Vector3();				//passed from previous frame, and initialized at zero, Vector3
		this.currentRotation = 0;							//angle of length of sub from horizon, Number
		this.auto = true;									//controls current mode, Boolean
		this.manualBallastTargets = [0, 0];					//controls current target proportionFull for each ballast in manual mode, Array(Number)
		this.targetDepth;									//target depth of submarine when depth locked, Number
	}

	//approximate volume of submarine, Number
	get volume()
	{
		return round(this.length * this.width * this.height);
	}

	//calculates total mass of assembly, Number
	get totalMass()
	{
		let tMass = this.mass;
		this.ballasts.forEach(ballast =>
		{
			tMass += ballast.mass;
		});
		return round(tMass);
	}

	//calculates weight force without ballasts,  Vector3
	get weightWithoutBallasts()
	{
		return g.clone().multiplyScalar(this.mass);
	}
	//vector weight force with ballasts, Vector3
	get weight()
	{
		return g.clone().multiplyScalar(this.totalMass);
	}

	//proportion of submarine below water surface, Number
	get proportionSubmerged()
	{
		/* 
		when position.y <= -height/2, returns 1,
		when position.y >= height/2, returns 0
		between -height/2 and height/2 return value decreases linearly from 1 to 0.
		*/		
		return clamp(1 - (this.entity.position.y / this.height), 0, 1);
	}

	//force due to buoyancy, Vector3
	get buoyancyForce()
	{
		return g.clone().multiplyScalar(-this.volume * this.proportionSubmerged * waterDensity);
	}

	//drag force due to water resistance, Vector3
	get waterResistanceForce()
	{
		let direction = this.oldVelocity.clone().normalize().multiplyScalar(-1);
		let speed = this.oldVelocity.clone().length();

		return direction.multiply(this.crossSectArea).multiply(this.dragCoefficient).multiplyScalar(0.5 * speed * speed * this.proportionSubmerged);
	}

	//resultant force on submarine, Vector3
	get resultantForce()
	{
		return this.buoyancyForce.clone().add(this.weight).add(this.waterResistanceForce);
	}

	//acceleration of submarine, Vector3
	get acceleration()
	{
		return this.resultantForce.clone().multiplyScalar(deltaTime / (1000 * this.mass));
	}
	
	//velocity of submarine, Vector3
	get velocity()
	{
		return this.oldVelocity.clone().add(this.acceleration.multiplyScalar(deltaTime/1000));
	}

	//distance from front of submarine that centre of mass is located, Number
	get centreOfMass()
	{
		let sumOfMassLengths = (this.ballastLocations[0] + ballastLocations[1]) * this.mass;
		sumOfMassLengths += this.ballastLocations[0] * this.ballasts[0].mass;
		sumOfMassLengths += (this.ballastLocations[0] + 2 * this.ballastLocations[1]) * this.ballasts[1].mass;
		return round(sumOfMassLengths / this.totalMass);
	}

	//geometric point where centre of mass is located, Vector3
	get centreOfMassPt()
	{
		let pt = this.entity.position.clone();
		pt.z -= this.length / 2
		pt.z += this.centreOfMass;
		return pt;
	}

	//torque about rotating axis (x), Number
	get torque()
	{
		let sinTheta = Math.sin(this.currentRotation + (Math.PI / 2));
		let buoyancyAndWeightT = (this.centreOfMass - this.ballastLocations[0] - this.ballastLocations[1]) * (this.buoyancyForce.length() - this.weightWithoutBallasts.length()) * sinTheta;
		let ballastOneT = -(this.centreOfMass - this.ballastLocations[0]) * this.ballasts[0].weight.length() * sinTheta;
		let ballastTwoT = (this.ballastLocations[0] + 2 * this.ballastLocations[1] - this.centreOfMass) * this.ballasts[1].weight.length() * sinTheta;
		return round(buoyancyAndWeightT + ballastOneT + ballastTwoT);
	}

	//moment of inertia about centre of mass, Number
	get momentOfInertia()
	{
		let MOIDueToBallastOne = Math.abs(this.centreOfMass - this.ballastLocations[0]) * this.ballasts[0].mass;
		let MOIDueToBallastTwo = Math.abs(this.ballastLocations[0] + 2 * this.ballastLocations[1] - this.centreOfMass) * this.ballasts[1].mass;
		let MOIDueToSubBody = Math.abs(this.centreOfMass - this.ballastLocations[0] - this.ballastLocations[1]) * this.mass;
		return  round(MOIDueToBallastOne + MOIDueToBallastTwo + MOIDueToSubBody);
	}

	//angular acceleration about rotating axis (x), Number
	get angularAcceleration()
	{
		return (this.torque / this.momentOfInertia) * (deltaTime / 1000);
	}

	//angular velocity about rotating axis (x), Number
	get angularVelocity()
	{
		return this.angularAcceleration * (deltaTime / 1000);
	}

	//method updates position and rotation of submarine every frame, void
	updatePhysics()
	{
		this.move();
		this.rotate();
	}

	//translates submarine in accordance with calculated velocity, void
	move()
	{
		this.entity.position.add(this.velocity);
		this.oldVelocity.copy(this.velocity);
	}

	//rotates submarine about center off mass in accordance with calculated angular velocity, void
	rotate()
	{
		this.currentRotation += this.angularVelocity;
		rotateAboutPoint(submarine.entity, this.centreOfMassPt, new THREE.Vector3(1, 0, 0), this.angularVelocity);
	}

	//sets control state of submarine, void
	setState(state, unlock=false)
	{
		//to overide emergency surface, set state must be called with second parameter true
		if((this.state === "emergencySurface" && unlock) || this.state !== "emergencySurface")
		{
			this.state = state;
			switch(state)
			{
				case "lockDepth":
				case "level":
					this.targetDepth = clamp(this.entity.position.y, -Infinity, 0);
					break;
				case "emergencySurface":
					this.auto = true;
					break;
			}
		}
		return false;
	}

	//fills both ballasts evenly, void
	fillBallasts()
	{
		if(this.proportionSubmerged > 0 )	//restrict taking in water to when submerged/floating
		{
			this.ballasts.forEach(ballast =>
				{
						ballast.addWater(ballast.flowRate * (deltaTime / 1000));
				});
		}
	}

	//empties both ballasts evenly, void
	emptyBallasts()
	{
		this.ballasts.forEach(ballast =>
		{
			ballast.subWater(ballast.flowRate * (deltaTime / 1000));
		})
	}

	//runs every frame to update parameters in accordance with controls, void
	updateControls()
	{
		//auto controls
		if(this.auto)
		{
			switch(this.state)
			{
				case "ascend":
					this.ascend();
					break;
				case "descend":
					this.descend();
					break;
				case "lockDepth":
					this.maintainDepth();
					break;
				case "level":
					this.level();
					this.maintainDepth();
					break;
				case "emergencySurface":
					this.emergencySurface();
					break;
			}
		}
		//manual controls
		else
		{
			this.ballasts.forEach((ballast, index) =>
				{
					if(ballast.proportionFull < this.manualBallastTargets[index])
					{
						ballast.addWater(ballast.flowRate * (deltaTime / 1000));
					}
					else if(ballast.proportionFull > this.manualBallastTargets[index])
					{
						ballast.subWater(ballast.flowRate * (deltaTime / 1000));
					}
				})
		}
	}

	//makes submarine ascend at this.ascentSpeed m/s, void
	ascend()
	{
		
		if(this.velocity.y > this.ascentSpeed)
		{
			this.fillBallasts();
		}
		else if(this.velocity.y < this.ascentSpeed)
		{
			this.emptyBallasts();
		}
	}

	//makes submarine descend at this.descentSpeed m/s, void
	descend()
	{
		
		if(this.velocity.y > -this.descentSpeed)
		{
			this.fillBallasts();
		}
		else if(this.velocity.y < -this.descentSpeed)
		{
			this.emptyBallasts();
		}
	}

	//makes submarine move towards target depth, void
	maintainDepth()
	{

		if(this.entity.position.y > this.targetDepth)
		{
			this.descend();
		}
		else if(this.entity.position.y < this.targetDepth)
		{
			this.ascend();
		}
	}

	//shifts distribution of water in ballasts to level sub, void
	level()
	{
		if(this.currentRotation < 0)
		{
			this.ballasts[1].addWater(this.ballasts[1].flowRate * (deltaTime / 1000));
			this.ballasts[0].subWater(this.ballasts[0].flowRate * (deltaTime / 1000));
		}
		if(this.currentRotation > 0)
		{
			this.ballasts[0].addWater(this.ballasts[0].flowRate * (deltaTime / 1000));
			this.ballasts[1].subWater(this.ballasts[1].flowRate * (deltaTime / 1000));
		}
	}

	//makes submarine ascend at this.emergencySurfaceSpeed, until it reaches surface, when it enters the 'lockDepth' state, void
	emergencySurface()
	{
		//-3 and not 0 so that it decellerates slightly before surfacing
		if(this.entity.position.y < -0.1)
		{
			if(this.velocity.y > this.emergencySurfaceSpeed)
			{
				this.fillBallasts();
			}
			else if(this.velocity.y < this.emergencySurfaceSpeed)
			{
				this.emptyBallasts();
			}
		}
		else
		{
			this.setState("lockDepth", true);
		}	
		
	}
}

/*-----------------------------variables--------------------------------*/
/*---------------------------html elements------------------------------*/
const canvas = document.getElementById("3DViewport");				//canvas object, HTMLElement

//ui structure elements
let inputPanel = document.getElementById("inputPanel");				//input panel where indicators are locationd, HTMLElement
let displayPanel = document.getElementById("displayPanel");			//display panel where controls are located, HTMLElement

//persistant ui buttons
let surfaceButton = document.getElementById("emergencySurface");	//emergency surface button, HTMLElement
let modeButton = document.getElementById("mode");					//mode button, HTMLElement

//manual controls
let ballastOneControl = createSlider(0, 100, 0);					//ballast one control slider, HTMLElement
let ballastOneControlDiv = document.createElement("div");			//ballast one slider container, HTMLElement
ballastOneControlDiv.innerHTML = "Ballast One:";
ballastOneControlDiv.appendChild(ballastOneControl);
let ballastTwoControl = createSlider(0, 100, 0);					//ballast two control slider, HTMLElement
let ballastTwoControlDiv = document.createElement("div");			//ballast two slider container, HTMLElement
ballastTwoControlDiv.innerHTML = "Ballast Two:";
ballastTwoControlDiv.appendChild(ballastTwoControl);

//automatic controls
let ascendButton = createButton("Ascend");							//ascend button, HTMLElement
let descendButton = createButton("Descend");						//descend button, HTMLElement
let lockDepth = createButton("Lock Depth");							//lock depth button, HTMLElement
let levelButton = createButton("Level");							//level craft button, HTMLElement

//display indicators
let fpsDisplay = createIndicator("FPS: ");							//fps display indicator, HTMLElement
let forceDisplay = createIndicator("F: ");							//vertical resultatn force indicator, HTMLElement
let accelerationDisplay = createIndicator("A: ");					//vertical acceleration indicator, HTMLElement
let velocityDisplay = createIndicator("V: ");						//vertical velocity indicator, HTMLElement
let depthDisplay = createIndicator("Depth: ");						//Depth indicator, HTMLElement

/*--------------------------renderer variables--------------------------*/
let renderer;			//three js renderer: interface for WebGL, Renderer

/*----------------------------time variables----------------------------*/
let deltaTime = 1000/60;		//time since preivous frame, ms. initialised at 1/60th of a second, Number
let previousTime = 0;			//time since main loop began that prev. frame was rendered, Number

/*----------------------------scene parameters--------------------------*/
//camera parameters
const fov = 90;															//field of view, degrees, Number
const nearClipping = 0.1;												//closest distance from camera a surface is rendered, Number
const farClipping = 4000;												//furthest distance from camera a surface is rendered, Number

//sun light parameters
const sunDistance = 400;												//distance of sun from origin, Number
const sunIncline = 0.48;												//incline of sun from directly above, Number
const sunAzimuth = 0.205;												//cardinal direction of sun, Number
const sunPosTheta = Math.PI * (sunIncline - 0.5);						//angle of sun from horizon, Number
const sunPosPhi = 2 * Math.PI * (sunAzimuth - 0.5);						//angle of sun from north, Number

//submarine parameters
const subLength = 0.302;												//submarine length, Number
const subHeight = 0.090;												//submarine height, Number
const subWidth = 0.232;													//submarine width, Number
const subMass = 5.5;												//mass of submarine without ballasts, Number

/*
modeling as a cuboid, drag coefficient given from https://www.engineersedge.com/fluid_flow/air_flow_drag_coefficient_14034.htm
*/
const subDragCoefficient = new THREE.Vector3(1.05, 1.05, 1.05);			//Drag coefficient traveling in each direction, Vector3
const subCrossSectArea = new THREE.Vector3(0.02718, 0.02088, 0.070064);	//cross sectional area in each direction, Vector3

/*
array(1) gives distance from edge of craft to ballast centre of mass. array(2) gives distance from ballast centre of mass to
submarine geometric center. shown below

<-a-> <--b--> <--b--> <-a->
-----B-------x-------B-----
*/
const ballastLocations = [0.050, 0.099];								//location of ballasts relative to front, Array(Number)

//ballast parameters
const ballastEmptyMass = 0.1;											//mass of ballast when empty, Number
const ballastMaxVolume = 0.00045;										//volume of water ballast can comtail, Number
const flowRate = 0.0183;												//rate at which water can enter and leave ballast, Number

//sub movement constraints
const subAscentSpeed = 0.01;												//speed at which sub ascends, Number
const subDescentSpeed = 0.01;											//speed at which sub descends, Number
const emergencySurfaceSpeed = 0.02;										//speed at which sub emergency surfaces, Number

/*-----------------------------scene objects----------------------------*/
let scene;				//contains all world objects, Scene
let camera;				//defines position and parameters of virtual camera, Camera
let cameraController;	//recieves input and adjusts camera location accordingly, OrbitControls
let sun;				//sun light source, DirectionLight
let sky;				//creates sky image, Sky
let cubeCamera;			//skybox: takes sky image and maps it to scene background, CubeCamera
let waterSurface;		//water surface plane, Water
let waterUnderside;		//upside down waterSurface copy so water is visible from below, Water
let submarine;			//instance of Submarine, contains all physical properties of sub, Submarine

/*------------------------------functions-----------------------------*/
/*------------------------- ---general use----------------------------*/

/*
	The default model loaders provided uses callback functions. Callback 
	functions look very ugly, and are very hard to read, so I've re-implemented
	the load function as a function that returns a promise below, so I can
	later use it with the significantly prettier async/await syntax.
*/

//function returns Promise which on resolve passes loaded model to callback
let modelLoader = new GLTFLoader();
let loadModel = url => 
{
    return new Promise(resolve =>
    {
        modelLoader.load(url, model =>
            {
                resolve(model);
            });
    });
}

//forces value to remain within range from min-max, Number
function clamp(value, min, max)
{
	return Math.max(min, Math.min(value, max));
}

//rounds to 5 s.f. to try and account for some floating point rounding errors, Number
function round(value)			
{
	return Math.round(value * 100000) / 100000;
}

//rotates passed geometry about a specified point, void
function rotateAboutPoint(obj, point, axis, angle)
{
	obj.parent.localToWorld(obj.position);
	obj.position.sub(point);
    obj.position.applyAxisAngle(axis, angle);
	obj.position.add(point);
	obj.parent.worldToLocal(obj.position);
	obj.rotateOnAxis(axis, angle)
}

//creates DOM slider element, HTMLElement
function createSlider(min, max, value)
{
	let slider = document.createElement("input");
	slider.type = "range";
	slider.min = min;
	slider.max = max;
	slider.value = value;
	return slider;
}

//creates DOM button element, HTMLElement
function createButton(text)
{
	let button = document.createElement("button");
	button.innerHTML = text;
	return button;
}

//creates indicator element - a bunch of spans, HTMLElement
function createIndicator(label)
{
	let container = document.createElement("span");
	let labelSpan = document.createElement("span");
	let value = document.createElement("span");
	labelSpan.innerHTML = label;
	container.appendChild(labelSpan);
	container.appendChild(value);
	return container;
}

/*------------------------------procedures-----------------------------*/
//overall program execution, async allows use of await on asynchronous function calls, Promise
async function entryPoint()
{
	drawDisplays();		//draw displays
	drawAutoMenu();		//draw controls	
	await init();		//initialize scene and objects
	updateDimensions();	//set size of canvas to match viewport dimensions
	mainLoop(0);		//begin mainLoop, passing an initial time of 0
}

//draws value indicators in top left, void
function drawDisplays()
{
	displayPanel.appendChild(fpsDisplay);
	displayPanel.appendChild(forceDisplay);
	displayPanel.appendChild(accelerationDisplay);
	displayPanel.appendChild(velocityDisplay);
	displayPanel.appendChild(depthDisplay);
}

//initialises Three.js and scene, Promise
async function init()
{
	//initialize renderer
	renderer = new THREE.WebGLRenderer({
		antialias: true,
		canvas: canvas
	});

	//create new scene
	scene = new THREE.Scene()

	//create and initialize camera
	camera = new THREE.PerspectiveCamera(fov, window.innerWidth/window.innerHeight, nearClipping, farClipping);
	cameraController = new OrbitControls(camera, canvas);
	cameraController.enableKeys = false;

	//set intial camera position
	camera.position.set(-0.5, 0.2, -0.6);
	cameraController.update();
	
	//create and add sun to scene
	sun = new THREE.DirectionalLight(0xffffff, 0.8);
	scene.add(sun);

	//set sun position
	sun.position.x = sunDistance * Math.cos(sunPosPhi);
	sun.position.y = sunDistance * Math.sin(sunPosPhi) * Math.sin(sunPosTheta);
	sun.position.z = sunDistance * Math.sin(sunPosPhi) * Math.cos(sunPosTheta);

	//create sky
	sky = new Sky();
	sky.material.uniforms.turbidity.value = 10;
	sky.material.uniforms.rayleigh.value = 2;
	sky.material.uniforms.luminance.value = 1;
	sky.material.uniforms.mieCoefficient.value = 0.005;
	sky.material.uniforms.mieDirectionalG.value = 0.8;
	sky.material.uniforms.sunPosition.value = sun.position.clone();

	//apply sky to background
	cubeCamera = new THREE.CubeCamera(0.1, 1, 128);
	cubeCamera.renderTarget.texture.generateMipmaps = true;
	cubeCamera.renderTarget.texture.minFilter = THREE.LinearMipmapLinearFilter;
	cubeCamera.update(renderer, sky);
	scene.background = cubeCamera.renderTarget

	//create and add water
	let waterGeometry = new THREE.PlaneBufferGeometry(4000,  4000);
	waterSurface = new Water(
		waterGeometry,
		{
			textureWidth: 1024,
			textureHeight: 1024,
			color: 0xffffff,
			flowDirection: new THREE.Vector2(1, 1),
			scale: 400,
		}
	);
	waterSurface.rotation.x = -Math.PI / 2;
	scene.add(waterSurface);

	//create and add water underside
	waterUnderside = waterSurface.clone();
	waterUnderside.rotation.x = Math.PI / 2;
	waterUnderside.position.y = -0.0005;
	scene.add(waterUnderside);

	//create ballasts
	let ballasts = [
		new Ballast(ballastEmptyMass, ballastMaxVolume, flowRate),
		new Ballast(ballastEmptyMass, ballastMaxVolume, flowRate)
	];

	//load submarine model
	let model = await loadModel("sub.gltf")
	let subEntity = model.scene.children[0];

	subEntity.material = new THREE.MeshStandardMaterial({color: 0x606060});

	//construct submarine object and add to scene
	submarine = new Submarine(subEntity,
							  subMass, 
							  subLength,
							  subWidth,
							  subHeight,
							  subDragCoefficient,
							  subCrossSectArea,
							  ballasts,
							  ballastLocations,
							  subAscentSpeed,
							  subDescentSpeed,
							  emergencySurfaceSpeed);
	scene.add(submarine.entity);
}

//resizes renderer to fit canvas, which always fills screen, void
function updateDimensions()
{
	let screenWidth = canvas.clientWidth;
	let screenHeight = canvas.clientHeight;

	//if current dimension != canvas dimensions, resize
	if(screenWidth !== canvas.width || screenHeight !== canvas.height)
	{
		renderer.setSize(screenWidth, screenHeight, false);
		camera.aspect = screenWidth / screenHeight;
		camera.updateProjectionMatrix();		
	}	
}

//runs once per frame, void
function mainLoop(currentTime)
{
	//update time variables
	//caps deltaTime = 1/30th of a second, avoids some interesting physics bugs caused by lag spikes
	//comes at the cost of making simulation inacurate below 30 frames per second
	deltaTime = clamp(currentTime - previousTime, 0, 1000/30);
	previousTime = currentTime;

	//update submarine and camera
	submarine.updateControls();
	submarine.updatePhysics();
	positionCamera();

	//update ui
	updateDisplays();

	//render scene
	renderer.render(scene, camera);
	
	//request next frame
	requestAnimationFrame(mainLoop);
}

//updates values in indicators, void
function updateDisplays()
{
	forceDisplay.childNodes[1].innerHTML = submarine.resultantForce.y;
	accelerationDisplay.childNodes[1].innerHTML = submarine.acceleration.y;
	velocityDisplay.childNodes[1].innerHTML = submarine.velocity.y;
	depthDisplay.childNodes[1].innerHTML = submarine.entity.position.y;
	fpsDisplay.childNodes[1].innerHTML = round(1000 / deltaTime);
}

//displaces camera with submarine velocity, void
function positionCamera()
{
	camera.position.add(submarine.velocity);
	cameraController.target.copy(submarine.entity.position);
	cameraController.update();
}

//draws auto menu state, void
function drawAutoMenu()
{
	inputPanel.innerHTML = "";
	inputPanel.appendChild(ascendButton);
	inputPanel.appendChild(descendButton);
	inputPanel.appendChild(lockDepth);
	inputPanel.appendChild(levelButton);
}

//draws manual menu state, void
function drawManualMenu()
{
	inputPanel.innerHTML = "";
	inputPanel.appendChild(ballastOneControlDiv);
	inputPanel.appendChild(ballastTwoControlDiv);
}

/*-------------------------events listeners-----------------------------*/
//manual controls
ballastOneControl.addEventListener("input", () =>
{
	submarine.manualBallastTargets[0] = ballastOneControl.value / 100;
});

ballastTwoControl.addEventListener("input", () =>
{
	submarine.manualBallastTargets[1] = ballastTwoControl.value / 100;
});

//mode button
modeButton.addEventListener("click", () =>
{
	//if in auto mode, draw manual controls, if in manual, draw auto
	if(submarine.auto)
	{
		drawManualMenu();
		modeButton.innerHTML = "Manual";
	}
	else
	{
		drawAutoMenu();
		modeButton.innerHTML = "Auto";
	}
	submarine.auto = !submarine.auto
});

//emergency surface button
surfaceButton.addEventListener("click", () => {submarine.setState("emergencySurface")});

//auto controls
ascendButton.addEventListener("click", () => {submarine.setState("ascend")});
descendButton.addEventListener("click", () => {submarine.setState("descend")});
lockDepth.addEventListener("click", () => {submarine.setState("lockDepth")});
levelButton.addEventListener("click", () => {submarine.setState("level")});

//resize event handler
window.addEventListener("resize", updateDimensions);

/*----------------------entry point---------------------------*/
entryPoint();