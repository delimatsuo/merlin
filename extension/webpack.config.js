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

module.exports = {
  mode: "development",
  devtool: "inline-source-map",
  entry: {
    content: "./src/content/index.ts",
    "service-worker": "./src/background/service-worker.ts",
    popup: "./src/popup/popup.ts",
    offscreen: "./src/offscreen/offscreen.ts",
    dashboard: "./src/dashboard/dashboard.ts",
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
    }),
    new CopyWebpackPlugin({
      patterns: [
        { from: "src/popup/popup.html", to: "popup.html" },
        { from: "src/popup/popup.css", to: "popup.css" },
        { from: "src/offscreen/offscreen.html", to: "offscreen.html" },
        { from: "src/dashboard/dashboard.html", to: "dashboard.html" },
        { from: "src/dashboard/dashboard.css", to: "dashboard.css" },
      ],
    }),
  ],
};
