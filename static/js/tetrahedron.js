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
let prev_mouse_pos = null;
let prev_mosue_time = null;

let rot_change_coeff = 0.001;
let rot_horiz = 0.5;
let rot_vert = 0.3;

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
		attribute vec4 aVertexColor;

		uniform mat4 uModelViewMatrix;
		uniform mat4 uProjectionMatrix;

		varying lowp vec3 vPos;
		varying lowp vec3 vNormal;
		varying lowp vec4 vColor;

		void main(void) {
		  gl_Position = uProjectionMatrix * uModelViewMatrix * vec4(aVertexPosition, 1.0);

		  vPos = gl_Position.xyz;
		  vNormal = (uModelViewMatrix * vec4(aFaceNormal, 0.0)).xyz;
		  vColor = aVertexColor;
		}
	`;

	// Fragment shader program
	const fsSource = `
		varying lowp vec3 vPos;
		varying lowp vec3 vNormal;
		varying lowp vec4 vColor;

		const lowp vec3 ambient_col = 0.2 * vec3(1.0, 1.0, 1.0);
		const lowp vec3 diffuse_1_col = vec3(1.0) - vec3(0.68, 0.85, 0.95);
		const lowp vec3 diffuse_2_col = vec3(1.0) - vec3(0.9, 0.8, 0.7);//vec3(1.0, 0.41, 0.58);

		const lowp float screenGamma = 2.2; // Assume the monitor is calibrated to the sRGB color space

		void main(void) {
			lowp vec3 normal = normalize(vNormal);

			lowp vec3 ambient_light = normalize(vec3(2.0, -2.0, -10.0));
			lowp vec3 light_1 = normalize(-1.5*vec3(2.0, -4.0, -5.0) - vPos);
			lowp vec3 light_2 = normalize(-1.5*vec3(-2.0, 8.0, 0.0) - vPos);

			lowp float diffuse_1_i = 1.0 * (clamp(dot(light_1, normal), 0.0, 1.0) - 0.0);
			lowp float diffuse_2_i = 1.0 * (clamp(dot(light_2, normal), 0.0, 1.0) - 0.0);

			lowp vec3 diffuse_res = 1.0*(diffuse_1_i * diffuse_1_col) + 1.0*(diffuse_2_i * diffuse_2_col);
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
	// console.log(normals);

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
	$(document).mousemove(handle_rot_mouse_move);
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


	// Now set up the colors for the faces. We'll use solid colors
	// for each face.
	const faceColors = [
		[1.0,  1.0,  1.0,  1.0],    // Front face: white
		[1.0,  0.0,  0.0,  1.0],    // Back face: red
		[0.0,  1.0,  0.0,  1.0],    // Top face: green
		[0.0,  0.0,  1.0,  1.0],    // Bottom face: blue
		[1.0,  1.0,  0.0,  1.0],    // Right face: yellow
		[1.0,  0.0,  1.0,  1.0],    // Left face: purple
		[1.0,  1.0,  0.0,  1.0],    // Right face: yellow
		[1.0,  0.0,  1.0,  1.0],    // Left face: purple
	];

	// Convert the array of colors into a table for all the vertices.
	var colors = [];

	for (var j = 0; j < faceColors.length; ++j) {
		const c = faceColors[j];

		// Repeat each color four times for the four vertices of the face
		colors = colors.concat(c, c, c);
	}

	const colorBuffer = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colors), gl.STATIC_DRAW);

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
		color: colorBuffer,
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

	let spin_axis = glMatrix.vec3.fromValues(-rot_vert, rot_horiz, 0);
	glMatrix.vec3.normalize(spin_axis, spin_axis);

	// Now move the drawing position a bit to where we want to
	// start drawing the square.
	glMatrix.mat4.translate(modelViewMatrix,     // destination matrix
	             modelViewMatrix,     // matrix to translate
	             [-0.0, 0.0, -5.0]);  // amount to translate
	glMatrix.mat4.rotate(modelViewMatrix,  // destination matrix
	          modelViewMatrix,  // matrix to rotate
	          cubeRotation * (rot_horiz+rot_vert),     // amount to rotate in radians
	          Array.from(spin_axis));       // axis to rotate around (Z)
	/*glMatrix.mat4.rotate(modelViewMatrix,  // destination matrix
	          modelViewMatrix,  // matrix to rotate
	          cubeRotation * rot_horiz,     // amount to rotate in radians
	          [0, 0, 1]);       // axis to rotate around (Z)
	glMatrix.mat4.rotate(modelViewMatrix,  // destination matrix
	          modelViewMatrix,  // matrix to rotate
	          cubeRotation * rot_vert,// amount to rotate in radians
	          [0, 1, 0]);       // axis to rotate around (X)*/

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

	// Tell WebGL how to pull out the colors from the color buffer
	// into the vertexColor attribute.
	{
		const numComponents = 4;
		const type = gl.FLOAT;
		const normalize = false;
		const stride = 0;
		const offset = 0;
		gl.bindBuffer(gl.ARRAY_BUFFER, buffers.color);
		gl.vertexAttribPointer(
		    programInfo.attribLocations.vertexColor,
		    numComponents,
		    type,
		    normalize,
		    stride,
		    offset);
		gl.enableVertexAttribArray(
		    programInfo.attribLocations.vertexColor);
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
	let cur_mouse_time = Date.now();

	// Get mouse position
	e = e || window.event;

    var cur_x = e.pageX;
    var cur_y = e.pageY;

    // IE 8
    if (cur_x === undefined) {
        cur_x = e.clientX + document.body.scrollLeft + document.documentElement.scrollLeft;
        cur_y = e.clientY + document.body.scrollTop + document.documentElement.scrollTop;
    }

    // Update buffers
    if(prev_mouse_pos !== null && prev_mouse_time !== null) {
    	let prev_x = prev_mouse_pos.x;
    	let prev_y = prev_mouse_pos.y;
    	let dt = cur_mouse_time - prev_mouse_time;
    	let dx = cur_x - prev_x;
    	let dy = cur_y - prev_y;
    	// Square dx and dy to make faster movements more impactful
    	let dx2 = Math.sign(dx) * Math.pow(dx, 2);
    	let dy2 = Math.sign(dy) * Math.pow(dy, 2);

    	let x_change = dx2/dt*rot_change_coeff;
    	let y_change = dy2/dt*rot_change_coeff;
    	
    	// Change rot based on changes
    	if(x_change)
    		rot_horiz += Math.min(x_change, 0.5);
    	if(y_change)
    		rot_vert += Math.min(y_change, 0.5);
    	console.log(rot_horiz)
    }

    // Set prevs
    prev_mouse_pos = {x: cur_x, y: cur_y};
    prev_mouse_time = cur_mouse_time;
}