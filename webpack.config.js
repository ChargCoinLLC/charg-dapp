const webpack = require('webpack');
const path = require("path");

const CleanWebpackPlugin = require('clean-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require("mini-css-extract-plugin");

let pathsToClean = [
  'dist',
  'build'
]

let cleanOptions = {
  	root:     path.resolve(__dirname),
  	verbose:  true,
  	dry:      false
}

module.exports = {
  
	entry: {
		index: './src/js/index.js'
	},
  
  	output: {
    	path: path.resolve(__dirname, 'dist/pages/'),
    	filename: '[name].[chunkhash].js'
  	},

  	module: {
	  
		rules: [
		{
			test: /\.css$/,
			use: [
			  {
				loader: MiniCssExtractPlugin.loader,
				options: {
					publicPath: '../css/'
				}
			  },
			  "css-loader"
			]
		},	  
		{
			test: /\.(jpg|png|gif)$/,
			loader: "file-loader?name=../images/[name].[ext]"
		},      
		{
			test: /\.html$/,
			use: [{
					loader: "html-loader",
					options: { minimize: false }
			}]
		}]
  	},
  	plugins: [
    
		new CleanWebpackPlugin(pathsToClean, cleanOptions),

		new HtmlWebpackPlugin({
			template: "./src/index.html",
			chunks: ['index'],
			filename: path.resolve(__dirname, 'dist/index.html')
		}),

		new HtmlWebpackPlugin({
			template: "./src/splash.html",
			chunks: ['index'],
			filename: path.resolve(__dirname, 'dist/splash.html')
		}),

		new HtmlWebpackPlugin({
			template: "./src/register.html",
			chunks: ['index'],
			filename: path.resolve(__dirname, 'dist/register.html')
		}),
		
		new HtmlWebpackPlugin({
			template: "./src/market.html",
			chunks: ['index'],
			filename: path.resolve(__dirname, 'dist/market.html')
		}),

		new MiniCssExtractPlugin({
			filename: "[name].[chunkhash].css",
			chunkFilename: "[id].css"
		})
  	],
	optimization: {
    	splitChunks: {
      		chunks: 'all'
    	}
  	}
};