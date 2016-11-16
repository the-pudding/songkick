import * as d3 from 'd3'
import ScrollMagic from 'scrollmagic'
import vec2 from 'gl-matrix-vec2'
import Path from './path'
import Boid from './boid'
import loadImage from './utils/load-image'
import * as $ from './utils/dom'

let scene = 'eq'

const PI = Math.PI
const TWO_PI = Math.PI * 2

let russell = null

const debug = false
const NUM_BOIDS = 1000
const NUM_PATH_POINTS = 64
const GRID_RESOLUTION = 30

let chartSize = 0

const madeEl = d3.select('#made')
const madeProseEl = d3.select('.made__prose')
const madeVisEl = d3.select('.made__vis')
const chartEl = d3.select('.made__chart') 
const canvas = chartEl.select('canvas')
const ctx = canvas.node().getContext('2d')

const ringData = [{
	capacity: 'Small venue',
	factor: 0.9,
},{
	capacity: 'Medium',
	factor: 0.6,
},{
	capacity: 'Big',
	factor: 0.3,
}]

let paths = []
let boids = []
let circleImg = null
let redImg = null

let venues = []
let bands = []

const offscreen = {
	width: null,
	height: null,
	data: null,
	image: null,
}

let maxShows = 0
let factors = null
let avg = null
let audioReady = false

function setupDOM() {
	chartSize = Math.min(window.innerHeight * 0.8, chartEl.node().offsetWidth)
	
	chartEl
		.style('width', `${chartSize}px`)
		.style('height', `${chartSize}px`)
	
	canvas
		.attr('width', chartSize * 2)
		.attr('height', chartSize * 2)
		.style('width',`${chartSize}px`)
		.style('height',`${chartSize}px`)	

	ctx.scale(2, 2)
}

function setupOffscreen() {
	const r = 1
	const tempCanvas = document.createElement('canvas')
	const tempCtx = tempCanvas.getContext('2d')
	tempCanvas.width = r * 4
	tempCanvas.height = r * 4

	tempCtx.scale(2, 2)

	tempCtx.beginPath()
	tempCtx.arc(r, r, r, 0, 2 * Math.PI, false)
	tempCtx.fillStyle = 'rgba(255,150,150,1)'
	// tempCtx.fillStyle = '#fff'
	// tempCtx.strokeStyle = 'rgba(150,150,150,0.5)'
	// tempCtx.stroke()
	tempCtx.fill()
	
	const tempData = tempCtx.getImageData(0, 0, r * 2, r * 2)
	
	const output = new Image()
	output.src = tempCanvas.toDataURL()

	offscreen.width = r * 2
	offscreen.height = r * 2
	offscreen.data = tempData.data
	offscreen.image = output
	offscreen.canvas = tempCanvas
}

function setupText() {
	const svg = chartEl.select('svg')
	//Create the SVG
	svg
		.attr('width', chartSize)
		.attr('height', chartSize)
	
	const TEXT_chartSize = 12
	
	const outerRadius = chartSize / 2
	const startY = chartSize / 2
	const endY = startY

	const arc = d3.arc()
		.startAngle(Math.PI)
		.endAngle(Math.PI * 3)

	const ring = svg.selectAll('.ring').data(ringData)

	const ringEnter = ring.enter()
		.append('g')
			.attr('class', (d, i) => `ring ring-${i}`)
			.classed('is-hidden', (d, i) => true)

	ringEnter.append('path')
		.attr('id', (d, i) => `text-${i}`)
		.attr('transform', `translate(${outerRadius}, ${outerRadius})`)
		// .attr('d', `M${d.startX},${startY} A${1},${1} 0 0,1 ${d.endX},${endY}`)
		.attr('d', d => arc({ innerRadius: 0, outerRadius: outerRadius * d.factor + TEXT_chartSize }))
		// .style('fill', 'none')
		// .style('stroke', '#ccc')
		// .style('stroke-dasharray', '5,5')

	ringEnter.append('text')
		.style('text-anchor','middle')
		// .attr('y', TEXT_chartSize)
		.attr('transform', `translate(0,-${TEXT_chartSize * 0.25})`)
	  .append('textPath')
		.attr('xlink:href', (d, i) => `#text-${i}`)
		.attr('startOffset', '50%')
		.text(d => `${d.capacity}`)
}

function setupPath(path, factor) {
	path.radius = 20
	d3.range(NUM_PATH_POINTS).forEach(d => {
		const angle = d / NUM_PATH_POINTS * Math.PI * 2
		const x = Math.cos(angle) * chartSize / 2 * factor
		const y = Math.sin(angle) * chartSize / 2 * factor
		// console.log(x, y)
		path.addPoint(chartSize / 2 + x, chartSize / 2 + y)
	})
}

function setupPaths() {
	paths = ringData.map(d => {
		const p = new Path(ctx)
		setupPath(p, d.factor)
		return p
	})
}

function setupBoids() {
	const incScale = d3.scalePow().exponent(0.5)

	incScale.domain([1, maxShows])
	incScale.range([.002, .008])

	boids = bands.slice(0,3000).map((d, i) => {
		const mass = 2
		const angle = Math.random() * Math.PI * 2

		const x = Math.cos(angle) * chartSize * ringData[0].factor / 2 + chartSize / 2
	  	const y = Math.sin(angle) * chartSize * ringData[0].factor / 2 + chartSize / 2
	  	const location = vec2.fromValues(x, y)

	  	const diff = ringData[0].factor - ringData[1].factor
		const ranDiff = Math.random() * diff / 3

	  	const ran = chartSize * (ringData[0].factor - diff / 3 + ranDiff) / 2

		return Boid({
			index: i,
			location,
			mass,
			path: paths[0],
			// circle: chartSize * ringData[0].factor / 2 + ran,
			circle: ran,
			center: [chartSize / 2, chartSize / 2],
			inc: incScale(d.shows.length),
			data: d,
		})
	})
}

function setupAudio() {
	const el = d3.select('.audio') 
	const ca = el.select('canvas')
	const ct = ca.node().getContext('2d')
	const size = 480
	
	ca
		.attr('width', size)
		.attr('height', size)
		.style('width', `${size}px`)
		.style('height', `${size}px`)

	const context = new (window.AudioContext || window.webkitAudioContext)()
	const analyser = context.createAnalyser()
	const audioElement = document.createElement('audio')

	audioElement.src = 'assets/potus-b.mp3'
	
	audioElement.addEventListener('canplay', function() {
		if (!audioReady) listen()
		audioReady = true
	})

	const listen = () => {
		const source = context.createMediaElementSource(audioElement);
		
		// Connect the output of the source to the input of the analyser
		source.connect(analyser);

		analyser.smoothingTimeConstant = 0.5

		// Connect the output of the analyser to the destination
		analyser.connect(context.destination);

		analyser.fftSize = 128
		const frequencyData = new Uint8Array(analyser.frequencyBinCount)

		const update = () => {
			// Get the new frequency data
			analyser.getByteFrequencyData(frequencyData);

			// ct.clearRect(0, 0, size, size)
			// ct.fillStyle = 'black'
			
			const mostBins = Math.floor(frequencyData.length * 0.7)
			factors = frequencyData.slice(0, mostBins).map(d => d / 256 * 100)
			avg = d3.mean(factors)
			
			// const radius = size / 2
			// const base = avg * radius / 4 / 100
			// const tempBands = bands.slice(0,2000)
			// tempBands.forEach((d, i) => {
			// 	const index = i % len
			// 	const radians = index / len * TWO_PI
			// 	const f = factors[index] * radius / 4 / 100
			// 	const travel = Math.floor(i / len) * (f * .02 + avg * 0.02)
			// 	const x = radius + Math.cos(radians) * (radius / 6 + travel)
			// 	const y = radius + Math.sin(radians) * (radius / 6 + travel)
			// 	ct.fillRect(x, y, 1,1)
			// })

			// Schedule the next update
			requestAnimationFrame(update)
		}

		update()
		render()
		audioElement.volume = 0.1
		audioElement.play()
		audioElement.loop = true
		audioElement.addEventListener('ended', () => {
			console.log('end')
		})
	}
}

function setupScroll() {
	const proseHeight = madeProseEl.node().offsetHeight
	const visHeight = madeVisEl.node().offsetHeight
	
	madeEl.style('height', `${proseHeight}px`)

	const controller = new ScrollMagic.Controller()
	const scene = new ScrollMagic.Scene({
		triggerElement: '#made',
		triggerHook: 0,
		duration: proseHeight - visHeight,
	})
	
	scene
		.on('enter', event => {
			madeVisEl.classed('is-fixed', true)
			madeVisEl.classed('is-bottom', false)

		})
		.on('leave', event => {
			madeVisEl.classed('is-fixed', false)
			madeVisEl.classed('is-bottom', event.scrollDirection === 'FORWARD')
		})
		.on('progress', event => {
			console.log(event)
			// render()
		})
		.addTo(controller)

	const triggerScenes = $.selectAll('.made__prose .trigger').map((el, i) => {
		const s = new ScrollMagic.Scene({
			triggerElement: el,
		})
		s
			.on('enter', event => {
				updateFlock(i)
			})
			.on('leave', event => {
				updateFlock(Math.max(0, i - 1))
			})
			.addTo(controller)
		return s
	})
}

function updateFlock(index) {
	d3.selectAll('.ring').each(function(d, i) {
		d3.select(this).classed('is-hidden', i > index)
	})
			
	// if (index === 0) {
	// 	for (var i = 0; i < 50; i++) {
	// 		boids[i].setPath(paths[0])
	// 		boids[i].setMass(2)
	// 	}
	// } else if (index === 1) {
	// 	boids[0].setSpecial(false)
	// 	for (var i = 0; i < 50; i++) {
	// 		boids[i].setPath(paths[1])
	// 		boids[i].setMass(5)
	// 	}
	// } else if (index === 2) {
	// 	boids[0].setSpecial(ringData[2].factor * chartSize / 2, chartSize / 2)
	// 	// boids[0].setPath(paths[2])
	// 	// boids[0].setMass(12)
	// }
}

function recolor(img, {r, b, g, t}) {
	const imgCanvas = document.createElement('canvas')
	const imgCtx = imgCanvas.getContext('2d')
	imgCanvas.width = img.width
	imgCanvas.height = img.height

	imgCtx.drawImage(img, 0, 0)
	const imgData = imgCtx.getImageData(0, 0, imgCanvas.width, imgCanvas.height)
	const data = imgData.data
	const len = data.length

	for (let i = 0; i < len;) {
    	data[i] = data[i++] * (1 - t) + (r * t)
    	data[i] = data[i++] * (1 - t) + (g * t)
    	data[i] = data[i++] * (1 - t) + (b * t)
    	i++
	}
	imgCtx.putImageData(imgData, 0, 0)

	// imgCtx.drawImage(img, 0, 0)
	// imgCtx.globalCompositeOperation = 'source-in'
	// imgCtx.fillStyle = color
	// imgCtx.rect(0, 0, canvas.width, canvas.height);
	// imgCtx.fill()
	
	const output = new Image()
	output.src = imgCanvas.toDataURL()
	return output
}

// function renderGrid(grid) {
// 	let len = grid.length

// 	for(let i = 0; i < len; i++) {
// 		const b = grid[i]
// 		const loc = b.getLocation()
// 	    // b.applyBehaviors(grid)
// 	    // b.run()
	    
// 	    // render boid 
// 	    const r = b.getRadius()
// 	    const special = b.getSpecial()
// 	    let img = b.index === 0 ? redImg : circleImg
// 	    img = special ? russell : img
// 		ctx.drawImage(img, loc[0] - r, loc[1] - r, r * 2, r * 2)
		
// 	}
// }

function render() {
	ctx.clearRect(0, 0, chartSize, chartSize)
	// ctx.fillStyle = 'rgba(255,255,255,0.25)'
	// ctx.fillRect(0, 0, chartSize, chartSize)
	ctx.fill()

	// let i = bands.length
	let i = boids.length
	const grid = d3.range(GRID_RESOLUTION).map(d => d3.range(GRID_RESOLUTION).map(d => []))
	

	const factorsLen = factors.length
	while (i--) {
		const b = boids[i]
		// b.counter += b.inc
		// // b.inc += Math.random() < 0.5 ? .0001 : -.0001
		// b.x = chartSize / 2 + Math.cos(b.counter) * b.circle
		// b.y = chartSize / 2 + Math.sin(b.counter) * b.circle
		
		let x
		let y
		if (scene === 'eq') {
				const index = i % factorsLen
				const radians = index / factorsLen * TWO_PI
				const f = factors[index] * chartSize / 2 / 4 / 100
				const travel = Math.floor(i / factorsLen) * (f * .02 + avg * 0.02)
				x = chartSize / 2 + Math.cos(radians) * (chartSize / 2 / 6 + travel)
				y = chartSize / 2 + Math.sin(radians) * (chartSize / 2 / 6 + travel)
		} else {
			b.run()	
			// const loc = b.getLocation()
		// b.applyBehaviors()
		

		// console.log(b.x)
		// const loc = b.getLocation()
		// const x = Math.floor(loc[0] / chartSize * GRID_RESOLUTION)
		// const y = Math.floor(loc[1] / chartSize * GRID_RESOLUTION)
		// const x = Math.round(Math.random() * chartSize)
		// const y = Math.round(Math.random() * chartSize)
			const pos = b.getPos()
			// console.log(pos[0])
			x = pos[0]
			y = pos[1]
		}
		
		ctx.drawImage(offscreen.canvas, x, y )
		
	}
	// let x = GRID_RESOLUTION
	// while(x--) {
	// 	let y = GRID_RESOLUTION
	// 	while(y--) {
	// 		if (debug) {
	// 			ctx.strokeStyle = '#ccc'
	// 			ctx.strokeRect(x / GRID_RESOLUTION * chartSize, y / GRID_RESOLUTION * chartSize, chartSize / GRID_RESOLUTION, chartSize / GRID_RESOLUTION)
	// 		}
			
	// 		renderGrid(grid[x][y])
	// 	}
	// }
	// if (debug) {
	// 	d3.range(NUM_PATH_POINTS).forEach(d => {
	// 		const angle = d / NUM_PATH_POINTS * Math.PI * 2
	// 		const x = Math.cos(angle) * chartSize / 2 * 0.9
	// 		const y = Math.sin(angle) * chartSize / 2 * 0.9
	// 		ctx.fillStyle = 'red'
	// 		ctx.fillRect(
	// 			chartSize / 2 + x,
	// 			chartSize / 2 + y,
	// 			4,
	// 			4,
	// 		)
	// 	})
	// }
	
	requestAnimationFrame(render)
}

// function render() {
// 	ctx.clearRect(0, 0, chartSize, chartSize)

// 	// create new Image data
// 	let canvasData = ctx.createImageData(chartSize, chartSize)
// 	// get the pixel data
// 	let cData = canvasData.data

// 	let i = bands.length
	
// 	// console.log(offscreen)
// 	const grid = d3.range(GRID_RESOLUTION).map(d => d3.range(GRID_RESOLUTION).map(d => []))
// 	while (i--) {
// 		const b = boids[i]
// 		const loc = b.getLocation()
// 		const x = Math.floor(loc[0] / chartSize * GRID_RESOLUTION)
// 		const y = Math.floor(loc[1] / chartSize * GRID_RESOLUTION)
// 		// grid[x][y].push(b)


// 		// now iterate over the image we stored 
//         for (let w = 0; w < offscreen.width; w++) {
//             for (let h = 0; h < offscreen.height; h++) {
                
//                 // get the position pixel from the image canvas
//                 const iData = (h * offscreen.width + w) * 4
                
//                 // get the position of the data we will write to on our main canvas
//                 const pData = (~~ (loc[0] + w) + ~~ (loc[1] + h) * chartSize) * 4
                 
//                 // copy the r/g/b/ and alpha values to our main canvas from 
//                 // our image canvas data.

//                 cData[pData] = offscreen.data[iData]
//                 cData[pData + 1] = offscreen.data[iData + 1]
//                 cData[pData + 2] = offscreen.data[iData + 2]
//                 cData[pData + 3] = offscreen.data[iData + 3]
//             }
//         }
// 	}
// 	ctx.putImageData(canvasData, 0, 0)
// 	// let x = GRID_RESOLUTION
// 	// while(x--) {
// 	// 	let y = GRID_RESOLUTION
// 	// 	while(y--) {
// 	// 		if (debug) {
// 	// 			ctx.strokeStyle = '#ccc'
// 	// 			ctx.strokeRect(x / GRID_RESOLUTION * chartSize, y / GRID_RESOLUTION * chartSize, chartSize / GRID_RESOLUTION, chartSize / GRID_RESOLUTION)
// 	// 		}
			
// 	// 		renderGrid(grid[x][y])
// 	// 	}
// 	// }
// 	// if (debug) {
// 	// 	d3.range(NUM_PATH_POINTS).forEach(d => {
// 	// 		const angle = d / NUM_PATH_POINTS * Math.PI * 2
// 	// 		const x = Math.cos(angle) * chartSize / 2 * 0.9
// 	// 		const y = Math.sin(angle) * chartSize / 2 * 0.9
// 	// 		ctx.fillStyle = 'red'
// 	// 		ctx.fillRect(
// 	// 			chartSize / 2 + x,
// 	// 			chartSize / 2 + y,
// 	// 			4,
// 	// 			4,
// 	// 		)
// 	// 	})
// 	// }
	
// 	// requestAnimationFrame(render)
// 	// setTimeout(render, 500)
// }

function getBoidX(d) {
	return d.getLocation()[0]
}

function getBoidY(d) {
	return d.getLocation()[1]
}

function init(data) {
	venues = data.venues
	bands = data.bands
		
	maxShows = d3.max(bands, d => d.shows.length)

	setupDOM()
	setupOffscreen()
	setupPaths()
	setupText()
	setupBoids()
	setupScroll()
	// setupAudio()
}


export default { init }
