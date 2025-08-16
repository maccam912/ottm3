module.exports = {
    Math: {
        Between: (min, max) => {
            return min + Math.floor(Math.random() * (max - min + 1));
        }
    }
};
