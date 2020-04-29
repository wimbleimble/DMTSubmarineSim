/*-----------------------------SUBSIM.JS-------------------------------
													By William Thomas :-)
	A basic simulator for a model submarine, impelmented in HTML5 using 
	Three.js, a webGL interface.

--------------------------------------------------------------CONTENTS-
LINE												SECTION
 XX													imports
 XX										  class/variable declarations
 XX												  entry point
 XX												   functions
 XX												 event handlers
-----------------------------------------------------------------------*/

/*---------------------------importing modules--------------------------*/
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

/*---------------------------html elements------------------------------*/
const canvas = document.getElementById("3DViewport");
let surfaceButton = document.getElementById("emergencySurface");
let fpsDisplay = document.getElementById("frameCounter");
let forceDisplay = document.getElementById("forceDisplay");
let accelerationDisplay = document.getElementById("accelerationDisplay");
let velocityDisplay = document.getElementById("velocityDisplay");

/*---------------------------content loaders----------------------------*/
/*
	The default model loader provided uses callback functions. Callback functions
	look very ugly, and are very hard to read, so I've re-implemented the load 
	function as a function that returns a promise below, so I can later use it 
	with the significantly nicer async/await syntax.
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

/*--------------------------renderer variables--------------------------*/

let renderer;			//three js renderer: interface for WebGL
let compositor;			//post processing object: combines different render passes
let scenePass;			//first render pass: basic scene render
let bloomPass;			//second render pass: renders bloomed pass

/*----------------------------time variables----------------------------*/
let deltaTime ;			//time since preivous frame
let previousTime = 0;	//time since main loop began prev. frame was rendered

/*-------------------------submarine class------------------------------*/
class Submarine
{
	constructor(mass)
	{
		this.buoyancyForce = new THREE.Vector3(0, 0, 0);
		this.waterResistanceMagnitude = new THREE.Vector3(5, 5, 5);
		this.mass = 50;
		this.maxVelocity;
		this.entity;
		this.depth;
		//previous velocity
		this._velocity = new THREE.Vector3(0, 0, 0);
	}
	//sum of gravity and buoyancy force
	get resultantA()
	{
		return this.buoyancyForce.clone().add(g);
	}
	get waterResistanceForce()
	{
		return this._velocity.clone().multiplyScalar(-1).multiply(this.waterResistanceMagnitude);
	}
	get resultantForce()
	{
		if(this.entity.position.y < 0)
		{
			return this.resultantA.clone().add(this.waterResistanceForce);
		}
		else
		{
			return g;
		}
	}
	get acceleration()
	{
		return this.resultantForce.clone().divideScalar(this.mass);
	}
	get velocity()
	{
		return this._velocity.add(this.acceleration.multiplyScalar(deltaTime/1000));
	}
	get submerged()
	{
		return this.entity.position.y < 0;
	}
	move()
	{
		this.entity.position.add(this.velocity);
	}
}

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

const risingForce = 15;



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
async function entryPoint()
{
	await init();		//initialize all scene objects
	updateDimensions();	//set size of canvas to match viewport dimensions
	mainLoop(0);		//begin mainLoop, passing an initial time of 0
}

async function init()
{
	renderer = new THREE.WebGLRenderer({
		antialias: true,
		canvas: canvas
	});

	scene = new THREE.Scene()
	camera = new THREE.PerspectiveCamera(fov, window.innerWidth/window.innerHeight, nearClipping, farClipping);
	cameraController = new OrbitControls(camera, canvas);
	cameraController.enableKeys = false;
	camera.position.set(14, 14, 5);
	cameraController.update();
	
	//add a 'sun' light source
	sun = new THREE.DirectionalLight(0xffffff, 0.8);
	scene.add(sun);
	sun.position.x = sunDistance * Math.cos(sunPosPhi);
	sun.position.y = sunDistance * Math.sin(sunPosPhi) * Math.sin(sunPosTheta);
	sun.position.z = sunDistance * Math.sin(sunPosPhi) * Math.cos(sunPosTheta);

	sky = new Sky();
	sky.material.uniforms.turbidity.value = 10;
	sky.material.uniforms.rayleigh.value = 2;
	sky.material.uniforms.luminance.value = 1;
	sky.material.uniforms.mieCoefficient.value = 0.005;
	sky.material.uniforms.mieDirectionalG.value = 0.8;
	sky.material.uniforms.sunPosition.value = sun.position.clone();

	cubeCamera = new THREE.CubeCamera(0.1, 1, 128);
	cubeCamera.renderTarget.texture.generateMipmaps = true;
	cubeCamera.renderTarget.texture.minFilter = THREE.LinearMipmapLinearFilter;

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

	cubeCamera.update(renderer, sky);
	scene.background = cubeCamera.renderTarget

	axes = new THREE.AxesHelper(5);
	scene.add(axes);

	submarine = new Submarine();
	let model = await loadModel("submarine.glb")
	submarine.entity = model.scene.children[0];
	submarine.entity.material = new THREE.MeshStandardMaterial({color: 0x606060});
	scene.add(submarine.entity);

	/*----------------------------post processing---------------------------*/
	compositor = new EffectComposer(renderer);
	scenePass = new RenderPass(scene, camera);
	bloomPass = new UnrealBloomPass(new THREE.Vector2( window.innerWidth, window.innerHeight ), 1.85, 0.4, 0.85);
	bloomPass.threshold = 1;
	bloomPass.strength = 1.9;
	bloomPass.radius = 0;
	compositor.addPass(scenePass);
	compositor.addPass(bloomPass);
}

function updateDimensions()
{
	canvas.width = window.innerWidth;
	canvas.height = window.innerHeight;
	compositor.setSize(window.innerWidth, window.innerHeight);
	camera.aspect = window.innerWidth/window.innerHeight;
	camera.updateProjectionMatrix();
	renderer.setSize(window.innerWidth, window.innerHeight);	
}

function mainLoop(currentTime)
{
	//update time variables
	deltaTime = currentTime - previousTime;
	previousTime = currentTime;

	//move all objects
	submarine.move();
	positionCamera();

	//ui
	updateDisplays();

	//render scene
	compositor.render(scene, camera);
	requestAnimationFrame(mainLoop);
}

function updateDisplays()
{
	forceDisplay.innerHTML = "F: " + submarine.resultantForce.x + " " + submarine.resultantForce.y + " " + submarine.resultantForce.z;
	accelerationDisplay.innerHTML = "A: " + submarine.acceleration.x + " " + submarine.acceleration.y + " " + submarine.acceleration.z;
	velocityDisplay.innerHTML = "V: " + submarine.velocity.x + " " + submarine.velocity.y + " " + submarine.velocity.z;
	fpsDisplay.innerHTML = Math.round(1000 / deltaTime);
}

function positionCamera()
{
	camera.position.add(submarine.velocity);
	cameraController.target.add(submarine.velocity);
	cameraController.update();
}

/*------------------------------events-----------------------------*/
let boy = false;

surfaceButton.addEventListener("click", () =>
{
	console.log("Surfacing!");
	if(!boy)
	{
		submarine.buoyancyForce.y = risingForce
	}
	else
	{
		submarine.buoyancyForce.y = 0;
	}
});

document.addEventListener("keydown", e =>
{
	if(!boy)
	{
		switch(e.keyCode)
		{
			case 38:
				submarine.buoyancyForce.y = risingForce;
				break;
			case 40:
				submarine.buoyancyForce.y = -risingForce;
				break
		}
	}
});

document.addEventListener("keyup", e =>
{
	if(!boy)
	{
		switch(e.keyCode)
		{
			case 38:
			case 40:
				submarine.buoyancyForce.y = 0;
				break;
		}
	}
});
window.addEventListener("resize", updateDimensions);