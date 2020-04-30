/*-----------------------------SUBSIM.JS--------------------------------
													By William Thomas :-)
	A basic simulator for a model submarine, impelmented in HTML5 using 
	Three.js, a webGL interface.

--------------------------------------------------------------CONTENTS--
LINE												SECTION
 XX													imports
 XX											   submarine classes
 XX										     variable declarations
 XX												  entry point
 XX												   functions
 XX												 event handlers
-----------------------------------------------------------------------*/

/*---------------------------importing modules-------------------------*/
import * as THREE from "/node_modules/three/build/three.module.js";
import {GLTFLoader} from "/node_modules/three/examples/jsm/loaders/GLTFLoader.js";
import {OrbitControls} from "/node_modules/three/examples/jsm/controls/OrbitControls.js";
import {Water} from "/node_modules/three/examples/jsm/objects/Water2.js";
import {Sky} from "/node_modules/three/examples/jsm/objects/Sky.js";
import {EffectComposer} from '/node_modules/three/examples/jsm/postprocessing/EffectComposer.js';
import {RenderPass} from '/node_modules/three/examples/jsm/postprocessing/RenderPass.js';
import {UnrealBloomPass} from '/node_modules/three/examples/jsm/postprocessing/UnrealBloomPass.js';

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
	get waterVolume()
	{
		return this.maxVolume * this.proportionFull;
	}
	get mass()
	{
		return this.emptyMass +  this.waterVolume * waterDensity;
	}
	get weight()
	{
		return g.clone().multiplyScalar(this.mass);
	}
	addWater(volume)
	{
		let newWater = this.waterVolume + volume;
		let newProportion = clamp(newWater / this.maxVolume, 0, 1);
		this.proportionFull = newProportion
	}
	subWater(volume)
	{
		this.addWater(-volume);
		
	}
}

class Submarine
{
	constructor(entity, mass, length, width, height, dragCoefficient, crossSectArea, ballasts, ballastLocations, ascentSpeed, descentSpeed, emergencySfaceSpeed)
	{
		this.entity = entity;								//submarine three.js object
		this.mass = mass;									//mass of submarine without ballasts, not full assembly
		this.length = length
		this.width = width;
		this.height = height;
		this.dragCoefficient = dragCoefficient;
		this.crossSectArea = crossSectArea;
		this.ballasts = ballasts;							//array containing both ballasts
		this.ballastLocations = ballastLocations;			//location of ballast relative to front

		this.ascentSpeed = ascentSpeed;
		this.descentSpeed = descentSpeed;
		this.emergencySurfaceSpeed = emergencySfaceSpeed;
		this.oldVelocity = new THREE.Vector3();				//passed from previous frame, and initialized at zero
		this.currentRotation = 0;
		this.auto = true;
		this.manualBallastTargets = [0, 0];
		this.targetDepth;
	}

	get volume()
	{
		return round(this.length * this.width * this.height);
	}

	get totalMass()
	{
		let tMass = this.mass;
		this.ballasts.forEach(ballast =>
		{
			tMass += ballast.mass;
		});
		return round(tMass);
	}

	get weightWithoutBallasts()
	{
		return g.clone().multiplyScalar(this.mass);
	}
	//vector weight
	get weight()
	{
		return g.clone().multiplyScalar(this.totalMass);
	}

	//proportion of submarine below water surface.
	get proportionSubmerged()
	{
		/* 
		when position.y <= -height/2, returns 1,
		when position.y >= height/2, returns 0
		between -height/2 and height/2 return value decreases linearly from 1 to 0.
		*/		
		return clamp(1 - (this.entity.position.y / this.height), 0, 1);
	}

	//force due to buoyancy
	get buoyancyForce()
	{
		return g.clone().multiplyScalar(-this.volume * this.proportionSubmerged * waterDensity);
	}

	//drag force due to water resistance, vector
	get waterResistanceForce()
	{
		let direction = this.oldVelocity.clone().normalize().multiplyScalar(-1);
		let speed = this.oldVelocity.clone().length();

		return direction.multiply(this.crossSectArea).multiply(this.dragCoefficient).multiplyScalar(0.5 * speed * speed * this.proportionSubmerged);
	}

	//total resultant force on submarine, vector
	get resultantForce()
	{
		return this.buoyancyForce.clone().add(this.weight).add(this.waterResistanceForce);
	}

	//acceleration of submarine, vector
	get acceleration()
	{
		return this.resultantForce.clone().multiplyScalar(deltaTime / (1000 * this.mass));
	}
	
	//velocity of submarine, vector
	get velocity()
	{
		return this.oldVelocity.clone().add(this.acceleration.multiplyScalar(deltaTime/1000));
	}

	//distance from front of submarine that centre of mass is located
	get centreOfMass()
	{
		let sumOfMassLengths = (this.ballastLocations[0] + ballastLocations[1]) * this.mass;
		sumOfMassLengths += this.ballastLocations[0] * this.ballasts[0].mass;
		sumOfMassLengths += (this.ballastLocations[0] + 2 * this.ballastLocations[1]) * this.ballasts[1].mass;
		return round(sumOfMassLengths / this.totalMass);
	}
	get centreOfMassPt()
	{
		let pt = this.entity.position.clone();
		pt.z -= this.length / 2
		pt.z += this.centreOfMass;
		return pt;
	}

	get torque()
	{
		let sinTheta = Math.sin(this.currentRotation + (Math.PI / 2));
		let buoyancyAndWeightT = (this.centreOfMass - this.ballastLocations[0] - this.ballastLocations[1]) * (this.buoyancyForce.length() - this.weightWithoutBallasts.length()) * sinTheta;
		let ballastOneT = -(this.centreOfMass - this.ballastLocations[0]) * this.ballasts[0].weight.length() * sinTheta;
		let ballastTwoT = (this.ballastLocations[0] + 2 * this.ballastLocations[1] - this.centreOfMass) * this.ballasts[1].weight.length() * sinTheta;
		return round(buoyancyAndWeightT + ballastOneT + ballastTwoT);
	}

	get momentOfInertia()
	{
		let MOIDueToBallastOne = Math.abs(this.centreOfMass - this.ballastLocations[0]) * this.ballasts[0].mass;
		let MOIDueToBallastTwo = Math.abs(this.ballastLocations[0] + 2 * this.ballastLocations[1] - this.centreOfMass) * this.ballasts[1].mass;
		let MOIDueToSubBody = Math.abs(this.centreOfMass - this.ballastLocations[0] - this.ballastLocations[1]) * this.mass;
		return  round(MOIDueToBallastOne + MOIDueToBallastTwo + MOIDueToSubBody);
	}

	get angularAcceleration()
	{
		return (this.torque / this.momentOfInertia) * (deltaTime / 1000);
	}

	get angularVelocity()
	{
		return this.angularAcceleration * (deltaTime / 1000);
	}

	//method updates position of submarine every frame
	updatePhysics()
	{
		//this.previousPosition.copy(this.entity.position);
		this.move();
		this.rotate();
	}
	move()
	{
		this.entity.position.add(this.velocity);
		this.oldVelocity.copy(this.velocity);
	}
	rotate()
	{
		this.currentRotation += this.angularVelocity;
		rotateAboutPoint(submarine.entity, this.centreOfMassPt, new THREE.Vector3(1, 0, 0), this.angularVelocity);
	}

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

	fillBallasts()
	{
		this.ballasts.forEach(ballast =>
		{
				ballast.addWater(ballast.flowRate * (deltaTime / 1000));
		});
	}

	emptyBallasts()
	{
		this.ballasts.forEach(ballast =>
		{
			ballast.subWater(ballast.flowRate * (deltaTime / 1000));
		})
	}

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

/*---------------------------html elements------------------------------*/
const canvas = document.getElementById("3DViewport");
let inputPanel = document.getElementById("inputPanel");
let displayPanel = document.getElementById("displayPanel");

let surfaceButton = document.getElementById("emergencySurface");
let modeButton = document.getElementById("mode");

let ballastOneControl = createSlider(0, 100, 0);
let ballastOneControlDiv = document.createElement("div");
ballastOneControlDiv.innerHTML = "Ballast One:";
ballastOneControlDiv.appendChild(ballastOneControl);

let ballastTwoControl = createSlider(0, 100, 0);
let ballastTwoControlDiv = document.createElement("div");
ballastTwoControlDiv.innerHTML = "Ballast Two:";
ballastTwoControlDiv.appendChild(ballastTwoControl);

let ascendButton = createButton("Ascend");
let descendButton = createButton("Descend");
let lockDepth = createButton("Lock Depth");
let levelButton = createButton("Level");

let fpsDisplay = createIndicator("FPS: ");
let forceDisplay = createIndicator("F: ");
let accelerationDisplay = createIndicator("A: ");
let velocityDisplay = createIndicator("V: ");
let depthDisplay = createIndicator("Depth: ");

/*---------------------------content loaders----------------------------*/
/*
	The default model loaders provided uses callback functions. Callback 
	functions look very ugly, and are very hard to read, so I've re-implemented
	the load function as a function that returns a promise below, so I can
	later use it with the significantly nicer async/await syntax.
*/
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
let textureLoader = new THREE.TextureLoader();
let loadTexture = url =>
{
	return new Promise(resolve =>
	{
		textureLoader.load(url, tex =>
			{
				resolve(model);
			})
	})
}

/*--------------------------renderer variables--------------------------*/

let renderer;			//three js renderer: interface for WebGL
let compositor;			//post processing object: combines different render passes
let scenePass;			//first render pass: basic scene render
let bloomPass;			//second render pass: renders bloomed pass

/*----------------------------time variables----------------------------*/
let deltaTime = 1000/60;//time since preivous frame. initialised at 1/60th of a second 
let previousTime = 0;	//time since main loop began that prev. frame was rendered

/*----------------------------scene parameters--------------------------*/
//camera parameters
const fov = 90;					//field of view
const nearClipping = 0.1;		//closest distance from camera a surface is rendered
const farClipping = 4000;		//furthest distance from camera a surface is rendered

//sun light parameters
const sunDistance = 400;							//distance of sun from origin
const sunIncline = 0.48;							//incline of sun from directly above
const sunAzimuth = 0.205;							//cardinal direction of sun
const sunPosTheta = Math.PI * (sunIncline - 0.5);	//angle of sun from horizon
const sunPosPhi = 2 * Math.PI * (sunAzimuth - 0.5);	//angle of sun from north

//submarine parameters
const subLength = 0.03;
const subHeight = 0.14;
const subWidth = 0.16;
const subMass = 0.2;													//overall mass of submarine

const subDragCoefficient = new THREE.Vector3(0.2, 0.4, 0.5);			//Drag coefficient traveling in each direction
const subCrossSectArea = new THREE.Vector3(0.02718, 0.02088, 0.070064);	//cross sectional area in each direction
const subBodyBuoyancy = new THREE.Vector3(0, 10, 0);					//buoyancy force on body without ballasts
const ballastLocations = [0.1, 10];										//location of ballasts relative to front.

//ballast parameters
const ballastEmptyMass = 0.01;		//mass of ballast when empty
const ballastMaxVolume = 0.0004;	//volume of water ballast can comtail
const flowRate = 0.0183;			//rate at which water can enter and leave ballast

//sub movement constraints
const subAscentSpeed = 0.1;
const subDescentSpeed = 0.1;
const emergencySurfaceSpeed = 0.2;

/*-----------------------------scene objects----------------------------*/
let scene;				//contains all world objects
let camera;				//defines position and parameters of virtual camera
let cameraController;	//recieves input and adjusts camera location accordingly
let sun;				//sun light source
let sky;				//creates sky image
let cubeCamera;			//skybox: takes sky image and maps it to scene background
let waterSurface;		//water surface plane
let waterUnderside;		//upside down waterSurface copy so water is visible from below
let axes;				//axis at origin for testing
let submarine;			//instance of Submarine, contains all physical properties of sub

entryPoint();

/*------------------------------functions-----------------------------*/

async function entryPoint()	//handles overall main process
{
	drawDisplays();		//draw displays
	drawAutoMenu();		//draw controls	
	await init();		//initialize all scene objects
	updateDimensions();	//set size of canvas to match viewport dimensions
	mainLoop(0);		//begin mainLoop, passing an initial time of 0
}

async function init()	//initialises Three.js and scene
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
	camera.position.set(14, 14, 5);
	cameraController.update();
	
	//creat and add sun to scene
	sun = new THREE.DirectionalLight(0xffffff, 0.8);
	scene.add(sun);
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
			scale: 40,
		}
	);
	waterSurface.rotation.x = -Math.PI / 2;
	scene.add(waterSurface);

	waterUnderside = waterSurface.clone();
	waterUnderside.rotation.x = Math.PI / 2;
	waterUnderside.position.y = -0.0005;
	scene.add(waterUnderside);

	//create axis object
	axes = new THREE.AxesHelper(5);
	//scene.add(axes);

	//create submarine
	let ballasts = [
		new Ballast(ballastEmptyMass, ballastMaxVolume, flowRate),
		new Ballast(ballastEmptyMass, ballastMaxVolume, flowRate)
	];
	let model = await loadModel("submarine.glb")
	let subEntity = model.scene.children[0];
	subEntity.material = new THREE.MeshStandardMaterial({color: 0x606060});

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
;
	//set up compositor
	compositor = new EffectComposer(renderer);
	scenePass = new RenderPass(scene, camera);
	bloomPass = new UnrealBloomPass(new THREE.Vector2( window.innerWidth, window.innerHeight ), 1.85, 0.4, 0.85);
	bloomPass.threshold = 1;
	bloomPass.strength = 1.9;
	bloomPass.radius = 0;
	compositor.addPass(scenePass);
	compositor.addPass(bloomPass);
}

function updateDimensions()	//resizes canvas to viewport
{
	let screenWidth = canvas.clientWidth;
	let screenHeight = canvas.clientHeight;
	if(screenWidth !== canvas.width || screenHeight !== canvas.height)
	{
		renderer.setSize(screenWidth, screenHeight, false);
		compositor.setSize(screenWidth, screenHeight);
		camera.aspect = screenWidth / screenHeight;
		camera.updateProjectionMatrix();		
	}	
}

function mainLoop(currentTime) //runs once per frame
{
	//update time variables
	deltaTime = 1000/60;//currentTime - previousTime;
	previousTime = currentTime;

	//move all objects
	submarine.updateControls();
	submarine.updatePhysics();
	positionCamera();

	//ui
	updateDisplays();

	//render scene
	compositor.render(scene, camera);
	
	//request next frame
	requestAnimationFrame(mainLoop);
}

function drawDisplays()
{
	displayPanel.appendChild(fpsDisplay);
	displayPanel.appendChild(forceDisplay);
	displayPanel.appendChild(accelerationDisplay);
	displayPanel.appendChild(velocityDisplay);
	displayPanel.appendChild(depthDisplay);
}

function updateDisplays()	//updates ui overlay
{
	forceDisplay.childNodes[1].innerHTML = submarine.resultantForce.y;
	accelerationDisplay.childNodes[1].innerHTML = submarine.acceleration.y;
	velocityDisplay.childNodes[1].innerHTML = submarine.velocity.y;
	depthDisplay.childNodes[1].innerHTML = submarine.entity.position.y;
	fpsDisplay.childNodes[1].innerHTML = round(1000 / deltaTime);
}

function positionCamera()	//displaces camera with submarine
{
	camera.position.add(submarine.velocity);
	cameraController.target.copy(submarine.entity.position);
	cameraController.update();
}

function drawAutoMenu()
{
	inputPanel.innerHTML = "";
	inputPanel.appendChild(ascendButton);
	inputPanel.appendChild(descendButton);
	inputPanel.appendChild(lockDepth);
	inputPanel.appendChild(levelButton);
}

function drawManualMenu()
{
	inputPanel.innerHTML = "";
	inputPanel.appendChild(ballastOneControlDiv);
	inputPanel.appendChild(ballastTwoControlDiv);
}

function clamp(value, min, max) //forces value to remain within range from min-max
{
	return Math.max(min, Math.min(value, max));
}

function round(value)			//rounds to 5 s.f. to try and account for some floating point rounding errors
{
	return Math.round(value * 100000) / 100000;
}

function rotateAboutPoint(obj, point, axis, angle)
{
	obj.parent.localToWorld(obj.position);
	obj.position.sub(point);
    obj.position.applyAxisAngle(axis, angle);
	obj.position.add(point);
	obj.parent.worldToLocal(obj.position);
	obj.rotateOnAxis(axis, angle)
}

function createSlider(min, max, value)
{
	let slider = document.createElement("input");
	slider.type = "range";
	slider.min = min;
	slider.max = max;
	slider.value = value;
	return slider;
}

function createButton(text)
{
	let button = document.createElement("button");
	button.innerHTML = text;
	return button;
}

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
/*------------------------------events-----------------------------*/
ballastOneControl.addEventListener("input", () =>
{
	submarine.manualBallastTargets[0] = ballastOneControl.value / 100;
});

ballastTwoControl.addEventListener("input", () =>
{
	submarine.manualBallastTargets[1] = ballastTwoControl.value / 100;
});

modeButton.addEventListener("click", () =>
{
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

surfaceButton.addEventListener("click", () => {submarine.setState("emergencySurface")});
ascendButton.addEventListener("click", () => {submarine.setState("ascend")});
descendButton.addEventListener("click", () => {submarine.setState("descend")});
lockDepth.addEventListener("click", () => {submarine.setState("lockDepth")});
levelButton.addEventListener("click", () => {submarine.setState("level")});

window.addEventListener("resize", updateDimensions);