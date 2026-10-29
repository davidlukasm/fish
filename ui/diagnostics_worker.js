self.onmessage = ({data}) => {
  try {
    self.postMessage({blob : new Blob([ JSON.stringify(data) ], {type : 'application/json'})});
  } catch (error) {
    self.postMessage({error : error.message});
  }
};
