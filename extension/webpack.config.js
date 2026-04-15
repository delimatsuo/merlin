const path = require("path");
const CopyWebpackPlugin = require("copy-webpack-plugin");

module.exports = {
  mode: "development",
  devtool: "inline-source-map",
  entry: {
    content: "./src/content/index.ts",
    "service-worker": "./src/background/service-worker.ts",
    popup: "./src/popup/popup.ts",
    offscreen: "./src/offscreen/offscreen.ts",
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
    new CopyWebpackPlugin({
      patterns: [
        { from: "src/popup/popup.html", to: "popup.html" },
        { from: "src/offscreen/offscreen.html", to: "offscreen.html" },
      ],
    }),
  ],
};
