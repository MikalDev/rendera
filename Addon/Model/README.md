README.md

Imlementation notes:
- Draco decoder is loaded in the ModelLoader.ts file.
- The decoder is loaded using the WebAssembly.instantiate() method, which allows for asynchronous loading of the decoder module.
- The decoder is registered with the WebIO instance in the ModelLoader constructor.
- The wasm file must be in the directory as the index.js rollup output.


Skinning implementation notes per node/mesh:
- Each mesh has a skin, which contains a list of joints, in a particular order, not necessarily sequential.
- The joint's matrix is the transformation matrix of the joint in the current pose (after animation is applied).
- Each joint also has an inverse bind matrix, which is the transformation matrix of the joint in the bind pose.
- The bind pose is the pose of the joints in the rest state, before any transformations are applied.

- For each joint in the skin, we need to create its bone matrix.
- To create a bone matrix for a joint, we need to multiply the joint's matrix by the inverse bind matrix.
- The bone matrices need to be stored in the animation state, mapped to the node of the mesh.
- The bone matrices length for a node is the number of joints in the skin for that node.
- The order is important, as the bone matrices need to be in the same order as the joints in the skin.
- The joints attributes for a mesh, reference the bone matrices for the node/mesh, in the same order as the joints in the skin. (they do not reference the joints directly, they reference the bone matrices.) So the range will be the number of joints in the skin for that node.

