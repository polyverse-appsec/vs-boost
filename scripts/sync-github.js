const { exec } = require("child_process");
const path = require("path");

// Read command line arguments
const repoUrl = process.argv[2];
const destFolderArg = process.argv[3];

if (!repoUrl || !destFolderArg) {
  console.error("Missing repository URL or destination folder.");
  process.exit(1);
}

// Resolve the destination folder to an absolute path
const destFolder = path.resolve(process.cwd(), destFolderArg);

// Get the repo name from the repo URL
const repoNameMatch = repoUrl.match(/\/([a-zA-Z0-9_-]+)(\.git)?$/);
if (!repoNameMatch) {
  console.error("Invalid repository URL.");
  process.exit(1);
}
const repoName = repoNameMatch[1];

// Compute the final destination folder
const finalDest = path.join(destFolder, repoName);

// Clone the repository
exec(`git clone ${repoUrl} ${finalDest}`, (err, stdout, stderr) => {
  if (err) {
    console.error(`Error cloning repository: ${err}`);
    process.exit(1);
  }
  console.log(stdout);
  console.log(stderr);
  console.log(`Successfully cloned ${repoUrl} into ${finalDest}`);
});
