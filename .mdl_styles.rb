#
# ====================================================
# Exceptions for markdownlint linting
# ====================================================
# Use with a `.mdlrc` file in your home directory with the following:
#   style "/path/to/dotfiles/.mdl_styles.rb"
#

all
rule 'MD003', :style => :atx
rule 'MD004', :style => :asterisk
rule 'MD024', :allow_different_nesting => true
rule 'MD029', :style => :ordered

exclude_rule 'MD002' # header levels increment by 1
exclude_rule 'MD013' # line length should be no more than 80 characters
exclude_rule 'MD022' # headers should be surrounded by blank lines
exclude_rule 'MD041' # First line in file should be a top level heading
