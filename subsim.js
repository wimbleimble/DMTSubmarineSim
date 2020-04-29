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
}

class Submarine
{
	constructor(entity, mass, length, width, height, dragCoefficient, crossSectArea, bodyBuoyancy, ballasts, ballastLocations)
	{
		this.mass = mass;
		this.length = length
		this.width = width;
		this.height = height;
		this.dragCoefficient = dragCoefficient;
		this.crossSectArea = crossSectArea;
		this.bodyBuoyancy = bodyBuoyancy;
		this.entity = entity;								//submarine three.js object
		this.appliedBuoyForce = new THREE.Vector3();		//force applied by ballasts
		this.ballasts = ballasts;							//array containing both ballasts
		this.ballastLocations = ballastLocations;			//location of ballast relative to front

		//below variables are passed from previous frame, and initialized at zero
		this.oldVelocity = new THREE.Vector3();
		this.oldPosition = entity.position.clone();
		//this.kineticEnergy = new THREE.Vector3();
	}

	get volume()
	{
		return this.length * this.width * this.height;
	}

	get totalMass()
	{
		let tmass = this.mass;
		this.ballasts.forEach(ballast =>
		{
			tmass += ballast.mass;
		});
		return tmass;
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

	//loss of kinetic energy to water resistance
	get kineticEnergyLoss()
	{
		return 
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
		let sumOfMassLengths = (this.length / 2) * this.mass;
		this.ballasts.forEach((ballast, index) => 
		{
			sumOfMassLengths += ballast.mass * ballastLengths[index];
		});

		return sumOfMassLengths / totalMass;
	}

	get kineticEnergy()
	{
		return (1/2) * this.mass * this.velocity.length() * this.velocity.length();
	}

	update()
	{
		//this.previousPosition.copy(this.entity.position);
		this.move();
		this.calculateEnergyLoss();
	}
	//method updates position of submarine every frame
	move()
	{
		this.entity.position.add(this.velocity);
		this.oldVelocity.copy(this.velocity);
	}
	calculateEnergyLoss()
	{

	}

}

/*---------------------------html elements------------------------------*/
const canvas = document.getElementById("3DViewport");
let surfaceButton = document.getElementById("emergencySurface");
let fpsDisplay = document.getElementById("frameCounter");
let forceDisplay = document.getElementById("forceDisplay");
let accelerationDisplay = document.getElementById("accelerationDisplay");
let velocityDisplay = document.getElementById("velocityDisplay");
let buoyancyDisplay = document.getElementById("buoyancyDisplay");
let dragDisplay = document.getElementById("dragDisplay");

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
const subMass = 0.2;											//overall mass of submarine

const subDragCoefficient = new THREE.Vector3(0.2, 0.4, 0.5);//Drag coefficient traveling in each direction
const subCrossSectArea = new THREE.Vector3(0.02718, 0.02088, 0.070064);	//cross sectional area in each direction
const subBodyBuoyancy = new THREE.Vector3(0, 10, 0);		//buoyancy force on body without ballasts
const ballastLocations = [0.1, 0.2];						//location of ballasts relative to front.

//ballast parameters
const ballastEmptyMass = 0.01;
const ballastMaxVolume = 0.0004;

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
	scene.add(axes);

	//create submarine
	let ballasts = [
		new Ballast(ballastEmptyMass, ballastMaxVolume),
		new Ballast(ballastEmptyMass, ballastMaxVolume)
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
							  subBodyBuoyancy,
							  ballasts,
							  ballastLocations);
	

	scene.add(submarine.entity);

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
	canvas.width = window.innerWidth;
	canvas.height = window.innerHeight;
	compositor.setSize(window.innerWidth, window.innerHeight);
	camera.aspect = window.innerWidth/window.innerHeight;
	camera.updateProjectionMatrix();
	renderer.setSize(window.innerWidth, window.innerHeight);	
}

function mainLoop(currentTime) //runs once per frame
{
	//update time variables
	deltaTime = 1000/60;//currentTime - previousTime;
	previousTime = currentTime;

	//move all objects
	submarine.update();
	positionCamera();
	console.log(submarine.ballasts[0]);
	//ui
	updateDisplays();

	//render scene
	compositor.render(scene, camera);
	
	//request next frame
	requestAnimationFrame(mainLoop);
}

function updateDisplays()	//updates ui overlay
{
	forceDisplay.innerHTML = "F: " + submarine.resultantForce.x + " " + submarine.resultantForce.y + " " + submarine.resultantForce.z;
	accelerationDisplay.innerHTML = "A: " + submarine.acceleration.x + " " + submarine.acceleration.y + " " + submarine.acceleration.z;
	velocityDisplay.innerHTML = "V: " + submarine.velocity.x + " " + submarine.velocity.y + " " + submarine.velocity.z;
	buoyancyDisplay.innerHTML = "B: " + submarine.buoyancyForce.x + " " + submarine.buoyancyForce.y + " " + submarine.buoyancyForce.z;
	dragDisplay.innerHTML = "D: " + submarine.waterResistanceForce.x + " " + submarine.waterResistanceForce.y + " " + submarine.waterResistanceForce.z;
	fpsDisplay.innerHTML = Math.round(1000 / deltaTime);
}

function positionCamera()	//displaces camera with submarine
{
	camera.position.add(submarine.velocity);
	cameraController.target.copy(submarine.entity.position);
	cameraController.update();
}

function clamp(value, min, max) //forces value to remain within range from min-max
{
	return Math.max(min, Math.min(value, max));
}

/*------------------------------events-----------------------------*/
let boy = false;

surfaceButton.addEventListener("click", () =>
{
	console.log("Surfacing!");
	if(!boy)
	{
		submarine.ballasts[0].proportionFull = 1;
		submarine.ballasts[1].proportionFull = 1;
	}
	else
	{
		submarine.ballasts[0].proportionFull = 0;
		submarine.ballasts[1].proportionFull = 0;
		
	}
	boy = !boy;
});
 
window.addEventListener("resize", updateDimensions);