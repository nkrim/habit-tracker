"use strict";
var cubeRotation = 0.0;

const positions = [
	 // Top front
	 0.0,  1.4,  0.0, 
	-1.0,  0.0,  1.0, 
	 1.0,  0.0,  1.0,

	 // Top left
	 0.0,  1.4,  0.0,
	-1.0,  0.0, -1.0,
	-1.0,  0.0,  1.0, 

	 // Top back
	 0.0,  1.4,  0.0,
	 1.0,  0.0, -1.0,
	-1.0,  0.0, -1.0,

	 // Top right
	 0.0,  1.4,  0.0,
     1.0,  0.0,  1.0,
     1.0,  0.0, -1.0,

     // Bottom front
	 0.0, -1.4,  0.0, 
	 1.0,  0.0,  1.0,
	-1.0,  0.0,  1.0, 

	 // Bottom left
	 0.0, -1.4,  0.0,
	-1.0,  0.0,  1.0,
	-1.0,  0.0, -1.0, 

	 // Bottom back
	 0.0, -1.4,  0.0,
	-1.0,  0.0, -1.0,
	 1.0,  0.0, -1.0,

	 // Bottom right
	 0.0, -1.4,  0.0,
     1.0,  0.0, -1.0,
     1.0,  0.0,  1.0,
];

let normals = [];

const indices = [
	0, 1, 2,
	3, 4, 5,
	6, 7, 8, 
	9, 10, 11,
	12, 13, 14,
	15, 16, 17,
	18, 19, 20,
	21, 22, 23,
];

// Rot interaction vars
// const velocity_degredation_time = 5;
const velocity_change_coeff = 0.005;
const max_velocity = 0.3;
const min_velocity = 0.01;

let prev_mouse_pos = null;
let prev_mouse_time = null;

let quat = glMatrix.quat.create();
{
	glMatrix.quat.rotateZ(quat, quat, Math.PI/16);
	// glMatrix.quat.rotateX(quat, quat, Math.PI/16);
}

let velocity_axis = glMatrix.vec3.fromValues(0.0, 1.0, 0.0); 
{
	let origin = glMatrix.vec3.create();
	glMatrix.vec3.rotateZ(velocity_axis, velocity_axis, origin, Math.PI/16);
	// glMatrix.vec3.rotateX(velocity_axis, velocity_axis, origin, Math.PI/16)
	console.log(velocity_axis)
}
let velocity_init = 0.0;
let velocity = min_velocity;
let prev_quat_buffer = [];
let prev_quat_buffer_size = 3;

let grabbed = false;

$(document).ready(function() {
	const canvas = document.querySelector("#graphics");
	const gl = canvas.getContext("webgl", {
		premultipliedAlpha: false  // Ask for non-premultiplied alpha
	});

	if (gl === null) {
	    alert("Unable to initialize WebGL. Your browser or machine may not support it.");
	    return;
	}

	// Set clear color to black, fully opaque
	gl.clearColor(0.0, 0.0, 0.0, 1.0);
	// Clear the color buffer with specified clear color
	gl.clear(gl.COLOR_BUFFER_BIT);

	const vsSource = `
		attribute vec3 aVertexPosition;
		attribute vec3 aFaceNormal;

		uniform mat4 uModelViewMatrix;
		uniform mat4 uProjectionMatrix;

		varying lowp vec3 vPos;
		varying lowp vec3 vNormal;

		void main(void) {
		  gl_Position = uProjectionMatrix * uModelViewMatrix * vec4(aVertexPosition, 1.0);

		  vPos = gl_Position.xyz;
		  vNormal = (uModelViewMatrix * vec4(aFaceNormal, 0.0)).xyz;
		}
	`;

	// Fragment shader program
	const fsSource = `
		varying lowp vec3 vPos;
		varying lowp vec3 vNormal;

		const lowp vec3 diffuse_1_col = vec3(1.0) - vec3(0.68, 0.85, 0.95);
		const lowp vec3 diffuse_2_col = vec3(1.0) - vec3(0.9, 0.8, 0.7);

		const lowp float screenGamma = 2.2; // Assume the monitor is calibrated to the sRGB color space

		void main(void) {
			lowp vec3 normal = normalize(vNormal);

			lowp vec3 light_1 = normalize(-1.25*vec3(2.0, -4.0, -5.0) - vPos);
			lowp vec3 light_2 = normalize(-1.25*vec3(-2.0, 8.0, 0.0) - vPos);

			lowp float diffuse_1_i = 1.0 * (clamp(dot(light_1, normal), 0.0, 1.0) - 0.0);
			lowp float diffuse_2_i = 1.0 * (clamp(dot(light_2, normal), 0.0, 1.0) - 0.0);

			lowp vec3 diffuse_res = (diffuse_1_i * diffuse_1_col) + (diffuse_2_i * diffuse_2_col);
			lowp vec3 final_col = vec3(1.0)-diffuse_res;

			lowp vec3 colorGammaCorrected = pow(final_col, vec3(1.0/screenGamma));

		  	gl_FragColor = vec4(colorGammaCorrected, diffuse_1_i+diffuse_2_i);
		}
	`;

	// Compile shader programs
	const shaderProgram = initShaderProgram(gl, vsSource, fsSource);

	// Collect all the info needed to use the shader program.
	const programInfo = {
	    program: shaderProgram,
	    attribLocations: {
	      	vertexPosition: gl.getAttribLocation(shaderProgram, 'aVertexPosition'),
	      	vertexColor: gl.getAttribLocation(shaderProgram, 'aVertexColor'),
	      	faceNormal: gl.getAttribLocation(shaderProgram, 'aFaceNormal'),
	    },
	    uniformLocations: {
	      	projectionMatrix: gl.getUniformLocation(shaderProgram, 'uProjectionMatrix'),
	     	modelViewMatrix: gl.getUniformLocation(shaderProgram, 'uModelViewMatrix'),
	    },
	};

	// Calculate surface normals
	for(let i=0; i<=positions.length-9; i+=9) {
		let p1 = glMatrix.vec3.fromValues(positions[i], positions[i+1], positions[i+2]);
		let p2 = glMatrix.vec3.fromValues(positions[i+3], positions[i+4], positions[i+5]);
		let p3 = glMatrix.vec3.fromValues(positions[i+6], positions[i+7], positions[i+8]);

		let u = glMatrix.vec3.create();
		glMatrix.vec3.sub(u, p2, p1);
		let v = glMatrix.vec3.create();
		glMatrix.vec3.sub(v, p3, p1);

		let normal = glMatrix.vec3.create();
		glMatrix.vec3.cross(normal, u, v);
		glMatrix.vec3.normalize(normal, normal);

		// Push the normal vector 3 times, to ensure it gets sent for each vertex
		let normal_arr = Array.from(normal);
		normals = normals.concat(normal_arr, normal_arr, normal_arr);
	}

	const buffers = initBuffers(gl);

	let t_prev = 0;

	// Render function
	// Draw the scene repeatedly
	function render(t_cur) {
		t_cur *= 0.001;  // convert to seconds
		const deltaTime = t_cur - t_prev;
		t_prev = t_cur;

		drawScene(gl, programInfo, buffers, deltaTime);

		window.requestAnimationFrame(render);
	}
	window.requestAnimationFrame(render);

	// Initialize handler for mouse movement for rotation interaction
	$('#graphics').mousedown(() => {
		grabbed = true;
	});	
	$('#graphics').bind('mouseup mouseleave', () => {
		if(!grabbed)
			return;

		// Set spinning velocity from prev_quat_buffer
		if(prev_quat_buffer.length > 0) {
			let size = Math.min(prev_quat_buffer.length, prev_quat_buffer_size);
			// Get average of quaternions
			let average_quat = glMatrix.quat.create();
			for(let i=0; i<size; i++) {
				let cur_quat = glMatrix.quat.clone(prev_quat_buffer[i]);
				// If dot product of cur_quat and current sum is negative, negate the cur_quat
				if(glMatrix.quat.dot(cur_quat, average_quat) < 0)
					glMatrix.quat.scale(cur_quat, cur_quat, -1);
				glMatrix.quat.add(average_quat, average_quat, cur_quat);
			}
			glMatrix.quat.normalize(average_quat, average_quat);
			// Set velocity
			let average_velocity = glMatrix.quat.getAxisAngle(velocity_axis, average_quat);
			velocity_init = Math.min(average_velocity, max_velocity);
			velocity = velocity_init;
		}

		// Reset grabbing vars
		grabbed = false;
		prev_mouse_pos = null;
		prev_mouse_time = null;
		prev_quat_buffer = [];
	});
	$('#graphics').mousemove($.throttle(10, true, handle_rot_mouse_move));
});

function initBuffers(gl) {
	// Create a buffer for the cube's vertex positions.
	const positionBuffer = gl.createBuffer();

	// Select the positionBuffer as the one to apply buffer
	// operations to from here out.
	gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);

	// Now pass the list of positions into WebGL to build the
	// shape. We do this by creating a Float32Array from the
	// JavaScript array, then use it to fill the current buffer.
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);


	// Init normal buffer
	const normalBuffer = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(normals), gl.STATIC_DRAW);


	// Build the element array buffer; this specifies the indices
	// into the vertex arrays for each face's vertices.
	const indexBuffer = gl.createBuffer();
	gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);

	// Now send the element array to GL
	gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,
	  new Uint16Array(indices), gl.STATIC_DRAW);

	return {
		position: positionBuffer,
		normal: normalBuffer,
		indices: indexBuffer,
	};
	}

	//
	// Draw the scene.
	//
	function drawScene(gl, programInfo, buffers, deltaTime) {
	gl.clearColor(1.0, 1.0, 1.0, 0.0);  // Clear to black, fully opaque
	gl.clearDepth(1.0);                 // Clear everything
	gl.disable(gl.BLEND);
	gl.enable(gl.DEPTH_TEST);           // Enable depth testing
	gl.depthFunc(gl.LEQUAL);            // Near things obscure far things

	gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); // For premultiplied alpha being false

	// Clear the canvas before we start drawing on it.
	gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

	// Create a perspective matrix, a special matrix that is
	// used to simulate the distortion of perspective in a camera.
	// Our field of view is 45 degrees, with a width/height
	// ratio that matches the display size of the canvas
	// and we only want to see objects between 0.1 units
	// and 100 units away from the camera.
	const fieldOfView = 45 * Math.PI / 180;   // in radians
	const aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;
	const zNear = 0.1;
	const zFar = 100.0;
	const projectionMatrix = glMatrix.mat4.create();

	// note: glmatrix.js always has the first argument
	// as the destination to receive the result.
	glMatrix.mat4.perspective(projectionMatrix,
					fieldOfView,
					aspect,
					zNear,
					zFar);

	// Set the drawing position to the "identity" point, which is
	// the center of the scene.
	const modelViewMatrix = glMatrix.mat4.create();

	// let spin_axis = glMatrix.vec3.fromValues(grabbed_y_change, grabbed_x_change, 0);
	// glMatrix.vec3.normalize(spin_axis, spin_axis);

	// Now move the drawing position a bit to where we want to
	// start drawing the square.
	glMatrix.mat4.translate(modelViewMatrix,     // destination matrix
	             modelViewMatrix,     // matrix to translate
	             [-0.0, 0.0, -5.0]);  // amount to translate

	// Apply velocity rotation from last grab
	if(velocity > 0 && !grabbed) {
		let vel_quat = glMatrix.quat.create();
		glMatrix.quat.setAxisAngle(vel_quat, velocity_axis, velocity);
		// console.log(vel_quat, velocity_axis, velocity);
		glMatrix.quat.mul(quat, vel_quat, quat);
	}
	// Degrade velocity
	// velocity = Math.max(min_velocity, velocity - (velocity_init*deltaTime/velocity_degredation_time));
	if(velocity > min_velocity)
		velocity = Math.max(min_velocity, velocity - (velocity*velocity_change_coeff));
	else if(velocity < min_velocity)
		velocity = Math.min(min_velocity, velocity + (velocity*velocity_change_coeff));


	// Apply rotation to modelview matrix
	let rot = glMatrix.mat4.create();
	glMatrix.mat4.fromQuat(rot, quat);
	glMatrix.mat4.mul(modelViewMatrix, 
			modelViewMatrix, 
			rot); 

	// cur_quat = quat.clone();
	// Tell WebGL how to pull out the positions from the position
	// buffer into the vertexPosition attribute
	{
		const numComponents = 3;
		const type = gl.FLOAT;
		const normalize = false;
		const stride = 0;
		const offset = 0;
		gl.bindBuffer(gl.ARRAY_BUFFER, buffers.position);
		gl.vertexAttribPointer(
		    programInfo.attribLocations.vertexPosition,
		    numComponents,
		    type,
		    normalize,
		    stride,
		    offset);
		gl.enableVertexAttribArray(
		    programInfo.attribLocations.vertexPosition);
	}

	// Normal buffer attribute info
	{
		const numComponents = 3;
		const type = gl.FLOAT;
		const normalize = false;
		const stride = 0;
		const offset = 0;
		gl.bindBuffer(gl.ARRAY_BUFFER, buffers.normal);
		gl.vertexAttribPointer(
		    programInfo.attribLocations.normalPosition,
		    numComponents,
		    type,
		    normalize,
		    stride,
		    offset);
		gl.enableVertexAttribArray(
		    programInfo.attribLocations.normalPosition);
	}

	// Tell WebGL which indices to use to index the vertices
	gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffers.indices);

	// Tell WebGL to use our program when drawing
	gl.useProgram(programInfo.program);

	// Set the shader uniforms
	gl.uniformMatrix4fv(
		  programInfo.uniformLocations.projectionMatrix,
		  false,
		  projectionMatrix);
	gl.uniformMatrix4fv(
		  programInfo.uniformLocations.modelViewMatrix,
		  false,
		  modelViewMatrix);

	{
		const vertexCount = 24;
		const type = gl.UNSIGNED_SHORT;
		const offset = 0;
		gl.drawElements(gl.TRIANGLES, vertexCount, type, offset);
	}

	// Update the rotation for the next draw

	if(!grabbed)
		cubeRotation += deltaTime;
}

//
// Initialize a shader program, so WebGL knows how to draw our data
//
function initShaderProgram(gl, vsSource, fsSource) {
	const vertexShader = loadShader(gl, gl.VERTEX_SHADER, vsSource);
	const fragmentShader = loadShader(gl, gl.FRAGMENT_SHADER, fsSource);

	// Create the shader program
	const shaderProgram = gl.createProgram();
	gl.attachShader(shaderProgram, vertexShader);
	gl.attachShader(shaderProgram, fragmentShader);
	gl.linkProgram(shaderProgram);

	// If creating the shader program failed, alert
	if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
		alert('Unable to initialize the shader program: ' + gl.getProgramInfoLog(shaderProgram));
		return null;
	}

	return shaderProgram;
}

//
// creates a shader of the given type, uploads the source and
// compiles it.
//
function loadShader(gl, type, source) {
	const shader = gl.createShader(type);

	// Send the source to the shader object
	gl.shaderSource(shader, source);

	// Compile the shader program
	gl.compileShader(shader);

	// See if it compiled successfully
	if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
		alert('An error occurred compiling the shaders: ' + gl.getShaderInfoLog(shader));
		gl.deleteShader(shader);
		return null;
	}

	return shader;
}

// Handle cube rot based on mouse movements
function handle_rot_mouse_move(e) {
	if(!grabbed)
		return;

	let cur_mouse_time = Date.now();
	let dt = Math.max(cur_mouse_time - prev_mouse_time, 0.001);

	// Get mouse position
	e = e || window.event;

    var cur_x = e.pageX;
    var cur_y = e.pageY;

    // IE 8
    if (cur_x === undefined) {
        cur_x = e.clientX + document.body.scrollLeft + document.documentElement.scrollLeft;
        cur_y = e.clientY + document.body.scrollTop + document.documentElement.scrollTop;
    }

    // Update quaternion and velocity buffer
    let rot_quat = null;
    if(prev_mouse_pos !== null && prev_mouse_time !== null) {
    	let prev_x = prev_mouse_pos.x;
    	let prev_y = prev_mouse_pos.y;
    	let dx = cur_x - prev_x;
    	let dy = cur_y - prev_y;

    	// Calculate change in axes
    	let rot_change_coeff = 5.0;
    	let x_change = dx/dt * rot_change_coeff;
    	let y_change = dy/dt * rot_change_coeff;
    	
    	// Make world-space rotation on grabbed_quat
    	rot_quat = glMatrix.quat.create();
    	glMatrix.quat.fromEuler(rot_quat, y_change || 0.0, x_change || 0.0, 0.0);
    	glMatrix.quat.mul(quat, rot_quat, quat);

    	// Update quat buffer
		prev_quat_buffer.push(rot_quat);
		// Flush buffer of excess, but leave most recent one unread
		while(prev_quat_buffer.length > prev_quat_buffer_size+1)
			prev_quat_buffer.shift();
    }

    // Set prevs
    prev_mouse_pos = {x: cur_x, y: cur_y};
    prev_mouse_time = cur_mouse_time;
}