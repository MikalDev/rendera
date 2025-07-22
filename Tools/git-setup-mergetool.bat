@echo off
git config --global merge.tool cursor
git config --global mergetool.cursor.cmd "cursor --wait --merge $REMOTE $LOCAL $BASE $MERGED"
git config --global mergetool.cursor.trustExitCode true
git config --global diff.tool cursor
git config --global difftool.cursor.cmd "cursor --wait --diff $LOCAL $REMOTE"
git config --global mergetool.keepBackup false
git config --global mergetool.prompt false
echo Cursor has been configured as your Git merge and diff tool!