/*--------------------------importing libraries--------------------------*/
import * as THREE from "./node_modules/three/build/three.module.js";
import {GLTFLoader} from "./node_modules/three/examples/jsm/loaders/GLTFLoader.js";
import {OrbitControls} from "./node_modules/three/examples/jsm/controls/OrbitControls.js";
import {Water} from "./node_modules/three/examples/jsm/objects/Water2.js";
import {Sky} from "./node_modules/three/examples/jsm/objects/Sky.js";
import { EffectComposer } from './node_modules/three/examples/jsm/postprocessing/EffectComposer.js';
import {RenderPass} from './node_modules/three/examples/jsm/postprocessing/RenderPass.js';
import {UnrealBloomPass} from './node_modules/three/examples/jsm/postprocessing/UnrealBloomPass.js';

/*---------------------------engine variables---------------------------*/
const canvas = document.getElementById("3DViewport");
let modelLoader = new GLTFLoader();
let textureLoader = new THREE.TextureLoader();
let scene = new THREE.Scene();
let renderer = new THREE.WebGLRenderer({
	antialias: true,
	canvas: canvas
});
let deltaTime = 0;
let previousTime = 0;

//camera
let camera = new THREE.PerspectiveCamera(90, window.innerWidth/window.innerHeight, 0.1, 4000);

//camera controls
let cameraController = new OrbitControls(camera, canvas);
cameraController.enableKeys = false;

//inital camera position
camera.position.set(14, 14, 5);
cameraController.update();

/*-----------------------------ui elements------------------------------*/

let surfaceButton = document.getElementById("emergencySurface");
let fpsDisplay = document.getElementById("frameCounter");
let forceDisplay = document.getElementById("forceDisplay");
let accelerationDisplay = document.getElementById("accelerationDisplay");
let velocityDisplay = document.getElementById("velocityDisplay");

/*-------------------------numerical constants--------------------------*/
const g = new THREE.Vector3(0, -9.81, 0);
const risingForce = 12;
const sunDistance = 400;
const sunIncline = 0.48;
const sunAzimuth = 0.205;

/*-------------------------------classes--------------------------------*/
class Submarine
{
	constructor(mass)
	{
		this.buoyancyForce = new THREE.Vector3(0, 0, 0);
		this.waterResistanceMagnitude = new THREE.Vector3(5, 5, 5);
		this.mass = 50;
		this.maxVelocity;
		this.model;
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
		if(this.model.position.y < 0)
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
		return this.model.position.y < 0;
	}
	move()
	{
		this.model.position.add(this.velocity);
	}
}

/*----------------------------scene variables---------------------------*/
let sun = new THREE.DirectionalLight(0xffffff, 0.8);
let sunPosTheta = Math.PI * (sunIncline - 0.5);
let sunPosPhi = 2 * Math.PI * (sunAzimuth - 0.5);
scene.add(sun);

sun.position.x = sunDistance * Math.cos(sunPosPhi);
sun.position.y = sunDistance * Math.sin(sunPosPhi) * Math.sin(sunPosTheta);
sun.position.z = sunDistance * Math.sin(sunPosPhi) * Math.cos(sunPosTheta);
let sky = new Sky();
sky.material.uniforms.turbidity.value = 10;
sky.material.uniforms.rayleigh.value = 2;
sky.material.uniforms.luminance.value = 1;
sky.material.uniforms.mieCoefficient.value = 0.005;
sky.material.uniforms.mieDirectionalG.value = 0.8;
sky.material.uniforms.sunPosition.value = sun.position.clone();

/* let underWaterSkyTexture = textureLoader.load("skybox3.png");
let underWaterSkyMaterial = new THREE. */

let cubeCamera = new THREE.CubeCamera(0.1, 1, 128);
cubeCamera.renderTarget.texture.generateMipmaps = true;
cubeCamera.renderTarget.texture.minFilter = THREE.LinearMipmapLinearFilter;


let waterGeometry = new THREE.PlaneBufferGeometry(4000,  4000);

let water = new Water(
	waterGeometry,
	{
		textureWidth: 1024,
		textureHeight: 1024,
		color: 0xffffff,
		flowDirection: new THREE.Vector2(1, 1),
		scale: 40,
	}
);

let waterUnderside = water.clone();
waterUnderside.rotation.x = Math.PI / 2;
waterUnderside.position.y = -0.0005;
water.rotation.x = -Math.PI / 2;
scene.add(waterUnderside);
scene.add(water);
cubeCamera.update(renderer, sky);
scene.background = cubeCamera.renderTarget

let axes = new THREE.AxesHelper(5);
scene.add(axes);

/*----------------------------post processing---------------------------*/
let compositor = new EffectComposer(renderer);
let scenePass = new RenderPass(scene, camera);
let bloomPass = new UnrealBloomPass(new THREE.Vector2( window.innerWidth, window.innerHeight ), 1.85, 0.4, 0.85);
bloomPass.threshold = 1;
bloomPass.strength = 1.9;
bloomPass.radius = 0;
compositor.addPass(scenePass);
compositor.addPass(bloomPass);

//submarine
let submarine = new Submarine();
modelLoader.load("submarine.glb", gltf =>
{
	submarine.model = gltf.scene.children[0];
	submarine.model.material = new THREE.MeshStandardMaterial({color: 0x606060});
	scene.add(submarine.model);
	updateDimensions();
	mainLoop(0);
});

function updateDimensions()
{
	canvas.width = window.innerWidth;
	canvas.height = window.innerHeight;
	compositor.setSize(window.innerWidth, window.innerHeight);
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
	positionCamera();
	compositor.render(scene, camera);
	requestAnimationFrame(mainLoop);
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