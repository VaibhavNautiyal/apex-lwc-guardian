import {tmpdir} from 'node:os'

// Stop git from finding a repository above the temp folder (on some machines the home folder is
// a git repository), so temporary "non-git" folders really are outside git.
process.env.GIT_CEILING_DIRECTORIES = tmpdir()
