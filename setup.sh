#
# =============================================================================
# Generic bash helper functions / customisation
# Kinda messy, mostly used for personal backup and sharing between machines
# Based on top of zsh / oh-my-zsh. Use at your own risk!
# Phil Ewels - @ewels
# =============================================================================
#
# Recommendation: Keep this git repo somewhere sensible and then just
# source this file in your ~/.zshrc
#

# Remember oh-my-zsh has a bunch of nice commands already
# Cheatsheet: https://github.com/ohmyzsh/ohmyzsh/wiki/Cheatsheet#directory
# My favourites:
# ------------------------------
# md : make directory
# rd : remove directory
# mkcd : mkdir and cd to it
# .. / ... etc : move up directories
# - : cd to the last directory
# d : List recent directories, then: 0-9 (as command) to go to directory with that index
# ------------------------------

# Basic Functioyn Aliases
alias ls='ls -p' # Adds slash after directory names
alias lsd='ls -d */' # List directories only
alias lol="ll | lolcat" # Taste the rainbow. pip install lolcat
alias du='du -sh ./* ./.*' # Disk usage with human readable units, including hidden flies and not recursive (zsh)
alias untar='tar -xvzf' # Easy untar
alias dos2unix="perl -pe 's/\r\n|\n|\r/\n/g'" # Convert line endings
alias docker_delete_all='docker rm $(docker ps -a -q) && docker rmi -f $(docker images -q); docker volume prune -f' # Delete all local Docker images
alias cat='bat --theme TwoDark' # Use the awesome `bat` instead of `cat`. Requires `brew install bat`

# Git shorthand
# oh-my-zsh has a git plugin with similar but different shortcuts, remember to remove that
alias gl="git log --graph --pretty=format:'%Cred%h%Creset %an: %s - %Creset %C(yellow)%d%Creset %Cgreen(%cr)%Creset' --abbrev-commit --date=relative"
alias gs='git status -sb' # Succinct git status
alias gb="git checkout -b " # Checkout a new branch
alias gbranch="git checkout -b " # Checkout a new branch
alias gclean="git branch --merged | egrep -v \"(^\*|master|dev|TEMPLATE)\" | xargs git branch -d; git fetch  --all --prune" # Clean local merged branches

# Helper function to pull + push updates from fork and upstream and clean old branches
function gupdate(){
  local upstream_branch="${1:dev}"
  local remote_name="origin"
  if git ls-remote --exit-code upstream; then
    remote_name="upstream"
  fi
  git pull
  git pull $remote_name "$upstream_branch"
  git push
  gclean
}

# Helper function to list all PRs for a repo using gh cli, but list additions, deletions and files changed
# Requires: https://cli.github.com/ and https://stedolan.github.io/jq/
function ghprs(){
  echo -e "PR\t+\t-\tFiles\tTitle"
  for pr in $(gh api repos/:owner/:repo/pulls | jq .[].number); do
    gh api repos/:owner/:repo/pulls/${pr} | jq .number,.additions,.deletions,.changed_files,.title | tr '\n' \\t
    echo ""
  done
}

# Use delta instead of diff - brew install delta
# https://github.com/dandavison/delta - `brew install git-delta`
alias diff="delta -s --syntax-theme TwoDark"

# Safety
# alias rm="rm -i"
alias mv='mv -i'
alias cp='cp -i'

# Nice colours in the terminal for OSX
export CLICOLOR=1
export LSCOLORS=GxFxCxDxBxegedabagaced

## Command prompt coloured by git status
function prompt_if_git_dirty(){
  PROMPT="❯"
  if STATUS=$(git status -s 2> /dev/null); then
    if [[ -z $STATUS ]] ; then
      # Git is clean - green prompt
      echo -en "$fg[green]$PROMPT $fg[default]"
    else
      # Git is dirty - red prompt
      echo -en "$fg[red]$PROMPT $fg[default]"
    fi
  else
    # Not a git repo - yellow prompt
    echo -en "$fg[yellow]$PROMPT $fg[default]"
  fi
}
setopt PROMPT_SUBST # zsh prompt expansion
PS1='$(prompt_if_git_dirty)'


# iTerm function to get current conda environment
# Specify as \(user.condaEnv) in an iTerm2 "Interpolated string" status bar component
function iterm2_print_user_vars() {
  iterm2_set_user_var condaEnv $CONDA_DEFAULT_ENV
}
# To remove the conda environment name prefix:
#   conda config --set env_prompt ''
# To remove iTerm2 shell integration blue arrow:
#   Preferences > Profiles > (your profile) > Terminal > Shell Integration > Turn off "Show mark indicators"

# Ruby renv packaging
if type "rbenv" > /dev/null 2>&1; then
  eval "$(rbenv init -)"
fi

# One command to extract them all
extract () {
  if [ $# -ne 1 ]
  then
    echo "Error: No file specified."
    return 1
  fi
  if [ -f $1 ] ; then
    case $1 in
      *.tar.bz2) tar xvjf $1   ;;
      *.tar.gz)  tar xvzf $1   ;;
      *.bz2)     bunzip2 $1    ;;
      *.rar)     unrar x $1    ;;
      *.gz)      gunzip $1     ;;
      *.tar)     tar xvf $1    ;;
      *.tbz2)    tar xvjf $1   ;;
      *.tgz)     tar xvzf $1   ;;
      *.zip)     unzip $1      ;;
      *.Z)       uncompress $1 ;;
      *.7z)      7z x $1       ;;
      *)         echo "'$1' cannot be extracted via extract" ;;
    esac
  else
    echo "'$1' is not a valid file"
  fi
}
