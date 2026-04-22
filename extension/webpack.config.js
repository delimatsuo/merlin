const path = require("path");
const webpack = require("webpack");
const CopyWebpackPlugin = require("copy-webpack-plugin");

// Firebase browser API key — identifies the GCP project, NOT a secret in the
// OAuth sense (it's gated by Identity Platform authorized domains + Firebase
// security rules), but we still inject it at build time so it isn't hardcoded
// in source and can be rotated without touching TypeScript. Falls back to the
// known production value so local dev builds work without extra setup.
const FIREBASE_API_KEY =
  process.env.FIREBASE_API_KEY || "AIzaSyAPhPf4qzo94WplQwQl9gbjauBbFOi7J3w";

// Backend URL. Default to prod so an unpacked-but-production build works out
// of the box (an earlier runtime `update_url` check pointed at localhost for
// any unpacked install, which silently broke every API call). Opt in to
// localhost with `API_BASE=http://localhost:8000 npm run build`.
const API_BASE =
  process.env.API_BASE ||
  "https://merlin-backend-531233742939.southamerica-east1.run.app";

module.exports = {
  mode: "development",
  devtool: "inline-source-map",
  entry: {
    content: "./src/content/index.ts",
    "service-worker": "./src/background/service-worker.ts",
    popup: "./src/popup/popup.ts",
    offscreen: "./src/offscreen/offscreen.ts",
    "merlin-bridge": "./src/content/merlin-bridge.ts",
  },
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "[name].js",
    clean: true,
  },
  resolve: {
    extensions: [".ts", ".js"],
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: "ts-loader",
        exclude: /node_modules/,
      },
    ],
  },
  plugins: [
    new webpack.DefinePlugin({
      "process.env.FIREBASE_API_KEY": JSON.stringify(FIREBASE_API_KEY),
      "process.env.API_BASE": JSON.stringify(API_BASE),
    }),
    new CopyWebpackPlugin({
      patterns: [
        { from: "src/popup/popup.html", to: "popup.html" },
        { from: "src/popup/popup.css", to: "popup.css" },
        { from: "src/offscreen/offscreen.html", to: "offscreen.html" },
      ],
    }),
  ],
};
