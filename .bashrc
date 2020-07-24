#
# =============================================================================
# Generic bash helper functions / customisation
# Kinda messy, mostly used for personal backup and sharing between machines
# Use at your own risk!
# Phil Ewels - @ewels
# =============================================================================
#
# Recommendation: Keep this git repo somewhere sensible and then just
# source this file in your home directory .bashrc / .bash_profile
#


# Basic Function Aliases
alias ls='ls -p' # Adds slash after directory names
alias ll='ls -lhtr' # Human readable filesizes by edit time
alias lsd='ls -l | grep ^d' # List directories only
alias lol="ll | lolcat" # Taste the rainbow. Requires `pip install lolcat`
alias du='du -kh' # Human readable directory filesizes
alias df='df -kTh' # Human readable drive sizes
alias untar='tar -xvzf' # Easy untar
alias dos2unix="perl -pe 's/\r\n|\n|\r/\n/g'" # Convert line endings
alias docker_delete_all='docker rm $(docker ps -a -q); docker rmi $(docker images -q)' # Delete all local Docker images
alias cat='bat --theme TwoDark' # Use the awesome `bat` instead of `cat`. Requires `brew install bat`
alias firefox='open -a /Applications/Firefox.app'
alias chrome='open -a "/Applications/Google Chrome.app" '
alias seqmonk='open -n -a seqmonk'
alias typora='open -a typora'
alias cd..='cd ../'
alias ..='cd ../'
alias ...='cd ../../'
alias ....='cd ../../../'
mkcd (){ mkdir -p -- "$1" && cd -P -- "$1"; }

# Git shorthand
alias gl="git log --graph --pretty=format:'%Cred%h%Creset %an: %s - %Creset %C(yellow)%d%Creset %Cgreen(%cr)%Creset' --abbrev-commit --date=relative"
alias gs='git status -sb' # Succinct git status
alias gb="git checkout -b " # Checkout a new branch
alias gbranch="git checkout -b " # Checkout a new branch
alias gclean="git branch --merged | egrep -v \"(^\*|master|dev|TEMPLATE)\" | xargs git branch -d && git fetch origin --prune" # Clean local merged branches
function gupdate(){
  local upstream_branch="${1:dev}"
  git pull
  git pull upstream "$upstream_branch"
  git push
  gclean
}

# brew install git bash-completion
[[ -r "/usr/local/etc/profile.d/bash_completion.sh" ]] && . "/usr/local/etc/profile.d/bash_completion.sh"

# Safety
# alias rm="rm -i"
alias mv='mv -i'
alias cp='cp -i'

# Bash history stuff
export HISTCONTROL=ignoreboth
export HISTFILESIZE=10000000
export HISTSIZE=10000000
export HISTIGNORE='&:ls:l:la:ll:exit'

# Nice Python exception traces
# https://github.com/Qix-/better-exceptions
export BETTER_EXCEPTIONS=1

# Nice colours in the terminal for OSX
export CLICOLOR=1
export LSCOLORS=GxFxCxDxBxegedabagaced


#################
## Command prompt, eg:
#   (conda_env)  ~/somedir/.../current_dir (branch) »
# Coloured, final » is green or red depending if git status is dirty or not
# Originally based on Git stuff from Guillermo - @guillermo-carrasco
# Added to quite a bit over the years
#

function parse_git_dirty {
  [[ $(git status 2> /dev/null | tail -n1) != "nothing to commit (working directory clean)" ]] && echo "*"
}
function parse_git_branch () {
  git branch 2> /dev/null | sed -e '/^[^*]/d' -e 's/* \(.*\)/ (\1)/'
}
RED="\[\033[0;31m\]"
YELLOW="\[\033[0;33m\]"
GREEN="\[\033[0;32m\]"
NO_COLOUR="\[\033[0m\]"

export MYPS='$(echo -n "${PWD/#$HOME/~}" | awk -F "/" '"'"'{
if (length($0) > 14) { if (NF>4) print $1 "/" $2 "/.../" $(NF-1) "/" $NF;
else if (NF>3) print $1 "/" $2 "/.../" $NF;
else print $1 "/.../" $NF; }
else print $0;}'"'"')'

function prompt_if_git_dirty(){
  if STATUS=$(git status -s 2> /dev/null); then
    if [[ -z $STATUS ]] ; then
      echo -en "\x01\033[0;32m\x02» \x01\033[0m\x02"
    else
      echo -en "\x01\033[0;31m\x02» \x01\033[0m\x02"
    fi
  else
    echo -en "» "
  fi
}

PS1=" $GREEN$MYPS$YELLOW\$(parse_git_branch)$NO_COLOUR \$(prompt_if_git_dirty)$NO_COLOUR"


# iTerm function to get current conda environment
# Doesn't work??
function iterm2_print_user_vars() {
  iterm2_set_user_var condaEnv $CONDA_DEFAULT_ENV
}

# Ruby renv packaging
eval "$(rbenv init -)"

# Homebrew installation of ruby / other stuff
export PATH=/usr/local/bin:$PATH

# Homebrew shell auto-completion
if type brew &>/dev/null; then
  HOMEBREW_PREFIX="$(brew --prefix)"
  if [[ -r "${HOMEBREW_PREFIX}/etc/profile.d/bash_completion.sh" ]]; then
    source "${HOMEBREW_PREFIX}/etc/profile.d/bash_completion.sh"
  else
    for COMPLETION in "${HOMEBREW_PREFIX}/etc/bash_completion.d/"*; do
      [[ -r "$COMPLETION" ]] && source "$COMPLETION"
    done
  fi
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


# From iTerm for remote shell integration
test -e "${HOME}/.iterm2_shell_integration.bash" && source "${HOME}/.iterm2_shell_integration.bash"
